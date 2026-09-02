import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const BAR_W = 3;
const BAR_GAP = 2;
const MIN_H = 0.18; // une barre à zéro donnerait des trous dans le tracé
const CURSOR = 9;
const TOUCH_PAD = 10; // marge tactile au-dessus/en dessous du tracé
// Écart au-delà duquel on considère qu'il s'agit d'un déplacement volontaire et non de la
// lecture qui avance : on saute alors sans animer.
const SEEK_JUMP = 0.08;
// Pendant le glissement, on ne repositionne pas l'audio à chaque frame — inutile, et ça
// sature le lecteur de demandes concurrentes.
const SEEK_THROTTLE_MS = 120;

/**
 * Silhouette d'un vocal, déduite de son URL.
 *
 * ⚠️ Ce n'est PAS la forme d'onde réelle du fichier : l'obtenir supposerait de décoder
 * l'audio côté client, ou de calculer les niveaux à l'enregistrement et de les stocker
 * (champ supplémentaire + migration). La silhouette est donc générée de façon
 * déterministe à partir de l'URL — stable d'un affichage à l'autre et d'un appareil à
 * l'autre, et visuellement équivalente.
 */
export const waveformFor = (seed: string, bars: number): number[] => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const base = ((h >>> 8) % 1000) / 1000; // 0 → 1
    // Enveloppe : les vocaux montent et redescendent, un bruit plat fait faux.
    const envelope = Math.sin((Math.PI * (i + 1)) / (bars + 1)) * 0.5 + 0.5;
    out.push(MIN_H + base * envelope * (1 - MIN_H));
  }
  return out;
};

/** Une barre du tracé d'enregistrement, qui rejoint sa nouvelle hauteur en glissant. */
function LiveBar({
  level,
  height,
  color,
  durationMs,
}: {
  level: number;
  height: number;
  color: string;
  durationMs: number;
}) {
  const h = useSharedValue(level);
  useEffect(() => {
    h.value = withTiming(level, { duration: durationMs, easing: Easing.linear });
  }, [level, durationMs, h]);
  const style = useAnimatedStyle(() => ({ height: Math.max(2, h.value * height) }));
  return (
    <Animated.View style={[{ width: BAR_W, borderRadius: BAR_W, backgroundColor: color }, style]} />
  );
}

/**
 * Tracé d'un enregistrement en cours.
 *
 * Le tableau de niveaux a une longueur FIXE et glisse d'un cran à chaque mesure : chaque
 * barre reçoit donc la valeur de sa voisine, et l'interpolation de hauteur transforme ce
 * décalage en vague continue. Empiler des barres à 10 images par seconde, comme le ferait
 * un rendu direct, produit au contraire un défilement haché.
 */
export function LiveWaveform({
  levels,
  color,
  height = 24,
  durationMs,
}: {
  levels: number[];
  color: string;
  height?: number;
  durationMs: number;
}) {
  return (
    <View className="flex-row items-center" style={{ height, gap: BAR_GAP }}>
      {levels.map((level, i) => (
        <LiveBar key={i} level={level} height={height} color={color} durationMs={durationMs} />
      ))}
    </View>
  );
}

/**
 * Barres d'un vocal, avec la portion lue mise en avant.
 *
 * La progression n'est PAS rendue en coloriant des barres entières : à trente barres, la
 * lecture avancerait par crans bien visibles. Le tracé est dessiné deux fois — inactif
 * dessous, coloré dessus — et la couche colorée est découpée à la largeur exacte.
 */
export function VoiceWaveform({
  levels,
  progress,
  tint,
  idleColor,
  height = 26,
  smoothMs = 0,
  showCursor = false,
  onSeek,
  blockGestures,
}: {
  levels: number[];
  progress: number; // 0 → 1
  tint: string;
  idleColor: string;
  height?: number;
  /** Durée d'interpolation entre deux mesures de progression (0 = pas de lissage). */
  smoothMs?: number;
  showCursor?: boolean;
  onSeek?: (ratio: number) => void;
  /**
   * Gestes de l'entourage que ce glissement doit emporter — celui de la bulle, typiquement.
   * Voir la note sur `blocksExternalGesture`.
   */
  blockGestures?: any[];
}) {
  // Largeur déterministe (barres + espaces) : inutile de mesurer la vue pour convertir
  // une position tactile en ratio, ni pour découper la couche colorée.
  const totalWidth = levels.length * BAR_W + Math.max(0, levels.length - 1) * BAR_GAP;

  const p = useSharedValue(progress);
  // Position imposée par le doigt. Tant qu'elle existe, elle prime sur la progression
  // rapportée par le lecteur : celle-ci arrive avec un temps de retard et ramènerait le
  // curseur en arrière à chaque mesure, ce qui rend le déplacement inutilisable.
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const originXRef = useRef(0);
  const lastSeekRef = useRef(0);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  useEffect(() => {
    if (scrub !== null) return; // le doigt commande
    if (smoothMs <= 0 || Math.abs(progress - p.value) > SEEK_JUMP) {
      p.value = progress; // premier rendu, saut volontaire, ou lissage désactivé
    } else {
      p.value = withTiming(progress, { duration: smoothMs, easing: Easing.linear });
    }
  }, [progress, smoothMs, scrub, p]);

  /**
   * Déplacement au doigt dans la piste.
   *
   * ⚠️ Geste RNGH, et NON un `PanResponder`. C'était un PanResponder (système de *responder*
   * JS de React Native) alors que la bulle qui l'entoure est pilotée par des gestes NATIFS
   * (RNGH, pour le glissement « répondre » et l'appui long). Les deux systèmes ne
   * s'arbitrent PAS entre eux : le geste natif du parent gagnait, et glisser sur l'onde
   * déclenchait la réponse au lieu de déplacer la lecture. Même famille de conflit que
   * l'appui long réglé plus tôt — dès qu'un geste natif est en jeu, tout doit l'être.
   *
   * ⚠️ Il ne suffit PAS d'être en RNGH : les deux gestes sont des `Pan` horizontaux, et
   * celui du parent est déclaré plus haut dans l'arbre. La bulle marque donc le sien
   * `.withRef()` et cette onde le bloque explicitement (voir `MessageEnter`) — sans quoi
   * les deux se disputent le doigt et le résultat dépend de l'ordre de montage.
   */
  const applyRef = useRef<(ratio: number, force: boolean) => void>(() => {});
  applyRef.current = (ratio: number, force: boolean) => {
    scrubRef.current = ratio;
    setScrub(ratio);
    p.value = ratio; // suit le doigt sans interpolation
    const now = Date.now();
    if (force || now - lastSeekRef.current > SEEK_THROTTLE_MS) {
      lastSeekRef.current = now;
      onSeekRef.current?.(ratio);
    }
  };

  const endRef = useRef<() => void>(() => {});
  endRef.current = () => {
    if (scrubRef.current !== null) onSeekRef.current?.(scrubRef.current);
    scrubRef.current = null;
    setScrub(null);
  };

  const applyJS = useCallback((ratio: number, force: boolean) => {
    applyRef.current(ratio, force);
  }, []);
  const endJS = useCallback(() => {
    endRef.current();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!onSeek)
        // ⚠️ Le glissement de l'onde PRIME sur celui de la bulle. `blocksExternalGesture`
        // vise le geste du parent, transmis en prop : sans cette déclaration, les deux
        // gestes horizontaux se disputent le doigt et le parent l'emporte.
        .blocksExternalGesture(...(blockGestures ?? []))
        // Seuls les gestes franchement horizontaux nous appartiennent : le fil défile
        // verticalement, et le lui voler rendrait la conversation impraticable.
        .activeOffsetX([-4, 4])
        .failOffsetY([-10, 10])
        // Un simple appui déplace aussi la lecture (`minDistance(0)` via activeOffset) :
        // c'est le geste attendu sur une barre de progression.
        .onBegin((e) => {
          'worklet';
          const ratio = Math.min(1, Math.max(0, e.x / totalWidth));
          runOnJS(applyJS)(ratio, true);
        })
        .onUpdate((e) => {
          'worklet';
          const ratio = Math.min(1, Math.max(0, e.x / totalWidth));
          runOnJS(applyJS)(ratio, false);
        })
        // ⚠️ `onFinalize` et pas seulement `onEnd` : un geste ANNULÉ (la liste reprend la
        // main, un second doigt) ne passe jamais par `onEnd`, et le curseur resterait
        // bloqué sous le doigt pour toujours.
        .onFinalize(() => {
          'worklet';
          runOnJS(endJS)();
        }),
    [onSeek, totalWidth, applyJS, endJS, blockGestures],
  );

  const fillStyle = useAnimatedStyle(() => ({ width: p.value * totalWidth }));
  const cursorStyle = useAnimatedStyle(() => ({ left: p.value * totalWidth - CURSOR / 2 }));

  const bars = (color: string) => (
    <View className="flex-row items-center" style={{ height, gap: BAR_GAP, width: totalWidth }}>
      {levels.map((level, i) => (
        <View
          key={i}
          style={{
            width: BAR_W,
            height: Math.max(2, level * height),
            borderRadius: BAR_W,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );

  const content = (
    <View
      // Bande tactile plus haute que le tracé : 26 px de haut, c'est trop fin pour
      // attraper le curseur du premier coup.
      style={{
        width: totalWidth,
        paddingVertical: onSeek ? TOUCH_PAD : 0,
        justifyContent: 'center',
      }}
    >
      <View style={{ width: totalWidth, height, justifyContent: 'center' }}>
        {bars(idleColor)}

        {/* Couche jouée, découpée à la largeur exacte de la progression. */}
        <Animated.View
          style={[
            { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
            fillStyle,
          ]}
        >
          {bars(tint)}
        </Animated.View>

        {showCursor ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: CURSOR,
                height: CURSOR,
                borderRadius: CURSOR,
                backgroundColor: tint,
                // Repère plus lisible pendant la saisie.
                transform: [{ scale: scrub !== null ? 1.35 : 1 }],
              },
              cursorStyle,
            ]}
          />
        ) : null}
      </View>
    </View>
  );

  // Sans `onSeek` (aperçu, enregistrement en cours) : aucun détecteur monté, donc rien qui
  // puisse interférer avec les gestes de la bulle.
  if (!onSeek) return content;

  return <GestureDetector gesture={pan}>{content}</GestureDetector>;
}
