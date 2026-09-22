import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import {
  acceptCall,
  clearCall,
  hangUp,
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
  const label =
    call.status === 'ended'
      ? t('calls.ended')
      : call.status === 'active'
        ? formatDuration(elapsed)
        : call.status === 'connecting'
          ? t('calls.connecting')
          : call.direction === 'outgoing'
            ? t('calls.calling')
            : t('calls.incoming');

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
        backgroundColor: c.canvas,
        paddingTop: insets.top + 48,
        paddingBottom: insets.bottom + 32,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <UserAvatar name={call.peer.name} photoUrl={call.peer.photoUrl} size={112} />
        <Text
          style={{ color: c.content, fontSize: 28, fontWeight: '700', marginTop: 24 }}
          numberOfLines={1}
        >
          {call.peer.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 17, marginTop: 8 }}>{label}</Text>
      </View>

      <View style={{ width: '100%', paddingHorizontal: 32 }}>
        {/* Sourdine et haut-parleur n'ont de sens qu'une fois dans le canal. */}
        {!incomingRinging && call.status !== 'ended' && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, marginBottom: 36 }}>
            <RoundButton
              icon={call.muted ? 'mic-off' : 'mic'}
              active={call.muted}
              label={t('calls.mute')}
              onPress={toggleMute}
            />
            <RoundButton
              icon={call.speaker ? 'volume-high' : 'volume-medium'}
              active={call.speaker}
              label={t('calls.speaker')}
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
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
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
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function Action({
  color,
  icon,
  label,
  rotate,
  onPress,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  rotate?: boolean;
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
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}
