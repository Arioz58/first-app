import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Animated, {
  Easing,
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

  const pan = useMemo(() => {
    const ratioAt = (pageX: number) =>
      Math.min(1, Math.max(0, (pageX - originXRef.current) / totalWidth));

    const apply = (ratio: number, force: boolean) => {
      scrubRef.current = ratio;
      setScrub(ratio);
      p.value = ratio; // suit le doigt sans interpolation
      const now = Date.now();
      if (force || now - lastSeekRef.current > SEEK_THROTTLE_MS) {
        lastSeekRef.current = now;
        onSeekRef.current?.(ratio);
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !!onSeekRef.current,
      // Seuls les gestes franchement horizontaux nous appartiennent : sinon on volerait
      // le défilement vertical du fil de discussion.
      onMoveShouldSetPanResponder: (_, g) =>
        !!onSeekRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // pageX - locationX = abscisse d'origine de la vue, sans avoir à la mesurer.
        originXRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        apply(ratioAt(e.nativeEvent.pageX), true);
      },
      onPanResponderMove: (e) => apply(ratioAt(e.nativeEvent.pageX), false),
      onPanResponderRelease: () => {
        if (scrubRef.current !== null) onSeekRef.current?.(scrubRef.current);
        scrubRef.current = null;
        setScrub(null);
      },
      onPanResponderTerminate: () => {
        scrubRef.current = null;
        setScrub(null);
      },
    });
  }, [totalWidth, p]);

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

  return (
    <View
      // Bande tactile plus haute que le tracé : 26 px de haut, c'est trop fin pour
      // attraper le curseur du premier coup.
      style={{
        width: totalWidth,
        paddingVertical: onSeek ? TOUCH_PAD : 0,
        justifyContent: 'center',
      }}
      {...(onSeek ? pan.panHandlers : {})}
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
}
