import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { RenderModeType, RtcSurfaceView } from 'react-native-agora';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import {
  acceptCall,
  clearCall,
  flipCamera,
  hangUp,
  minimizeCall,
  toggleCamera,
  toggleMute,
  toggleSpeaker,
  useCall,
} from '../lib/callEngine';
import { useThemeColors } from '../lib/theme';
import { UserAvatar } from './UserAvatar';

/**
 * L'appel en cours, par-dessus toute l'application.
 *
 * ⚠️ Monté dans `app/_layout.tsx` hors du `Stack`, comme `ToastStack` et
 * `VoiceMiniPlayer`, et NON comme un écran de navigation. Un appel entrant doit s'afficher
 * quel que soit l'endroit où l'on se trouve, y compris pendant une autre navigation ; et
 * un écran empilé survivrait mal à la fin de l'appel (retour arrière vers un écran d'appel
 * terminé, pile à nettoyer). Ici, il apparaît et disparaît avec l'état de l'appel.
 */

/** Une fois l'appel fini, on laisse le temps de lire pourquoi avant de disparaître. */
const CLOSE_DELAY_MS = 1400;

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function CallOverlay() {
  const call = useCall();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  const status = call?.status;
  const startedAt = call?.startedAt ?? null;

  /**
   * Chronomètre. ⚠️ Recalculé depuis l'horodatage du décroché plutôt qu'incrémenté d'une
   * seconde à chaque battement : un compteur qui s'incrémente dérive dès que l'application
   * est mise en veille, et l'appel afficherait une durée plus courte que la réalité.
   */
  useEffect(() => {
    if (status !== 'active' || !startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, startedAt]);

  /**
   * Un appel commence — passé ou reçu : on FERME LE CLAVIER.
   *
   * ⚠️ Demande de Berke (24/09), pour l'accessibilité : resté ouvert, le clavier recouvre le
   * bas de l'écran d'appel, là où sont décrocher, raccrocher et le haut-parleur, et un
   * lecteur d'écran continue de proposer un champ de saisie qui n'est plus à l'écran.
   *
   * ⚠️ Déclenché sur l'IDENTIFIANT de l'appel, pas sur son état : le fermer une fois au début
   * suffit, et le refaire à chaque changement d'état (sonnerie → connexion → en cours)
   * refermerait un clavier que la personne aurait rouvert exprès pendant l'appel.
   */
  const callId = call?.callId;
  useEffect(() => {
    if (callId) Keyboard.dismiss();
  }, [callId]);

  // L'appel est fini : on laisse le dernier message à l'écran, puis on efface.
  useEffect(() => {
    if (status !== 'ended') return;
    const id = setTimeout(() => clearCall(), CLOSE_DELAY_MS);
    return () => clearTimeout(id);
  }, [status]);

  if (!call) return null;

  const incomingRinging = call.direction === 'incoming' && call.status === 'ringing';

  /**
   * ⚠️ On s'efface pendant que le SYSTÈME fait sonner : son écran d'appel s'affiche
   * par-dessus tout, y compris sur un téléphone verrouillé, et empiler le nôtre dessous
   * donnerait deux interfaces d'appel pour un seul appel — l'utilisateur en refermerait
   * une et trouverait l'autre derrière.
   *
   * ⚠️ Uniquement pendant la SONNERIE : une fois décroché, c'est notre écran qui porte la
   * sourdine, le haut-parleur et la durée.
   */
  if (call.nativeUI && incomingRinging) return null;
  // Réduit : c'est le bandeau vert (`CallBanner`) qui prend le relais.
  if (call.minimized) return null;
  // On peut réduire tant que l'appel vit — sauf pendant qu'un appel ENTRANT sonne, où il
  // faut d'abord répondre ou refuser (même règle que `minimizeCall`).
  const canMinimize = !incomingRinging && call.status !== 'ended';
  const isVideo = call.type === 'video';
  const label =
    call.status === 'ended'
      ? t('calls.ended')
      : call.status === 'active'
        ? formatDuration(elapsed)
        : call.status === 'connecting'
          ? t('calls.connecting')
          : call.direction === 'outgoing'
            ? t('calls.calling')
            : isVideo
              ? t('calls.incoming_video')
              : t('calls.incoming');

  /**
   * VIDÉO. ⚠️ Ma caméra n'est montrée que si elle tourne : chez l'appelant dès la sonnerie
   * (aperçu), chez l'appelé seulement après le décroché — on ne l'allume pas pour un appel
   * qu'on n'a pas encore accepté. ⚠️ Et jamais une fois l'appel fini : la caméra est éteinte,
   * la vue resterait noire.
   */
  const showLocal = isVideo && call.status !== 'ended' && !incomingRinging;
  const showRemote = isVideo && call.status === 'active' && call.remoteUid !== null;
  // Caméra coupée chez l'autre : sa vue reste MONTÉE (voir le recyclage plus bas), on la
  // recouvre de son avatar plutôt que de laisser une image figée.
  const remoteHidden = showRemote && call.remoteCameraOff;
  const localStyle = showRemote
    ? ({
        position: 'absolute',
        top: insets.top + 56,
        right: 16,
        width: 108,
        height: 160,
        borderRadius: 14,
        overflow: 'hidden',
      } as const)
    : StyleSheet.absoluteFill;
  // Par-dessus une image, le texte passe en blanc : les couleurs du thème y seraient illisibles.
  const onVideo = showLocal || showRemote;
  const fg = onVideo ? '#FFFFFF' : c.content;
  const fgMuted = onVideo ? 'rgba(255,255,255,0.8)' : c.muted;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        /**
         * ⚠️ Au-dessus de tout, y compris des bandeaux d'alerte (`ToastStack`, 100) et du
         * rappel de vocal (50). Sans `zIndex`, ce calque est rendu AVANT le `Stack` dans
         * l'arbre et se retrouve donc DERRIÈRE l'application : il existait, il était
         * simplement invisible. Un appel prime sur tout le reste.
         */
        zIndex: 200,
        backgroundColor: onVideo ? '#000000' : c.canvas,
        paddingTop: insets.top + 48,
        paddingBottom: insets.bottom + 32,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {showRemote && (
        <RtcSurfaceView
          key="remote"
          style={StyleSheet.absoluteFill}
          canvas={{ uid: call.remoteUid!, renderMode: RenderModeType.RenderModeHidden }}
        />
      )}
      {remoteHidden && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111827' }]} />}
      {/*
        Mon image : plein écran tant que l'autre n'est pas là, vignette ensuite.
        ⚠️ UNE SEULE vue, jamais démontée pendant l'appel — seul son style change. Sous la
        New Architecture, une vue native démontée est RECYCLÉE pour la suivante : remonter
        l'aperçu en vignette (clé différente) libérait l'ancienne vue plein écran, aussitôt
        réutilisée pour l'image de l'autre — qu'Agora tenait encore pour la sortie de MA
        caméra. Les deux flux se disputaient la même vue et celui de l'autre ne s'affichait
        pas (constaté le 03/10 dans les journaux Agora : même adresse de vue pour les deux).
      */}
      {showLocal && (
        <RtcSurfaceView
          key="local"
          style={localStyle}
          // ⚠️ Sur Android, deux SurfaceView se superposent dans un ordre indéfini sans ceci :
          // la vignette pourrait passer DERRIÈRE l'image plein écran.
          zOrderMediaOverlay
          canvas={{ uid: 0, renderMode: RenderModeType.RenderModeHidden }}
        />
      )}
      {/*
        Ma caméra coupée : un cache PAR-DESSUS la vue, jamais un démontage. ⚠️ Démonter la vue
        locale la rendrait au recyclage, et l'image de l'autre pourrait hériter d'une vue
        qu'Agora tient encore pour la mienne — le défaut corrigé à l'étape 1.
      */}
      {showLocal && call.cameraOff && (
        <View
          style={[
            localStyle,
            { backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          {showRemote && <Ionicons name="videocam-off" size={26} color="#FFFFFF" />}
        </View>
      )}
      {canMinimize && (
        <Pressable
          onPress={minimizeCall}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('calls.minimize')}
          style={{ position: 'absolute', top: insets.top + 8, left: 16, padding: 8 }}
        >
          <Ionicons name="chevron-down" size={28} color={fg} />
        </Pressable>
      )}
      <View style={{ alignItems: 'center' }}>
        {/* L'avatar s'efface devant le visage de l'autre : il ne servait qu'à le remplacer. */}
        {(!showRemote || remoteHidden) && (
          <UserAvatar name={call.peer.name} photoUrl={call.peer.photoUrl} size={112} />
        )}
        <Text
          style={{
            color: fg,
            fontSize: 28,
            fontWeight: '700',
            marginTop: showRemote && !remoteHidden ? 0 : 24,
          }}
          numberOfLines={1}
        >
          {call.peer.name}
        </Text>
        <Text style={{ color: fgMuted, fontSize: 17, marginTop: 8 }}>{label}</Text>
        {remoteHidden && (
          <Text style={{ color: fgMuted, fontSize: 15, marginTop: 6 }}>
            {t('calls.peer_camera_off')}
          </Text>
        )}
      </View>

      <View style={{ width: '100%', paddingHorizontal: 32 }}>
        {/* Sourdine et haut-parleur n'ont de sens qu'une fois dans le canal. */}
        {!incomingRinging && call.status !== 'ended' && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              // Quatre boutons en vidéo : l'écart d'origine les ferait déborder.
              gap: isVideo ? 16 : 28,
              marginBottom: 36,
            }}
          >
            <RoundButton
              icon={call.muted ? 'mic-off' : 'mic'}
              active={call.muted}
              label={t('calls.mute')}
              onVideo={onVideo}
              onPress={toggleMute}
            />
            {isVideo && (
              <RoundButton
                icon={call.cameraOff ? 'videocam-off' : 'videocam'}
                active={call.cameraOff}
                label={t('calls.camera')}
                onVideo={onVideo}
                onPress={async () => {
                  if (!(await toggleCamera())) Alert.alert('', t('calls.camera_denied'));
                }}
              />
            )}
            {isVideo && (
              <RoundButton
                icon="camera-reverse"
                active={false}
                label={t('calls.flip')}
                onVideo={onVideo}
                onPress={flipCamera}
              />
            )}
            <RoundButton
              icon={call.speaker ? 'volume-high' : 'volume-medium'}
              active={call.speaker}
              label={t('calls.speaker')}
              onVideo={onVideo}
              onPress={toggleSpeaker}
            />
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: incomingRinging ? 'space-around' : 'center',
          }}
        >
          {incomingRinging && (
            <Action
              color="#16A34A"
              icon="call"
              label={t('calls.accept')}
              onVideo={onVideo}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                acceptCall();
              }}
            />
          )}
          {call.status !== 'ended' && (
            <Action
              color="#DC2626"
              icon="call"
              rotate
              label={incomingRinging ? t('calls.decline') : t('calls.hang_up')}
              onVideo={onVideo}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                hangUp();
              }}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function RoundButton({
  icon,
  label,
  active,
  onVideo,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onVideo?: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={onPress}
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? c.content : c.surface,
        }}
      >
        <Ionicons name={icon} size={26} color={active ? c.canvas : c.content} />
      </Pressable>
      <Text style={{ color: onVideo ? '#FFFFFF' : c.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function Action({
  color,
  icon,
  label,
  rotate,
  onVideo,
  onPress,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  rotate?: boolean;
  onVideo?: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Pressable
        onPress={onPress}
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
        }}
      >
        {/* Le combiné renversé est le signe universel du raccroché — pas besoin de mot. */}
        <Ionicons
          name={icon}
          size={30}
          color="#FFFFFF"
          style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined}
        />
      </Pressable>
      <Text style={{ color: onVideo ? '#FFFFFF' : c.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}
