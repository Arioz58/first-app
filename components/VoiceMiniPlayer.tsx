import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUND } from '../lib/radius';
import { pauseVoice, playVoice, stopVoice, useVoicePlayback } from '../lib/voicePlayback';
import { FLOATING_SHADOW } from './GlassSurface';
import { UserAvatar } from './UserAvatar';

const NEXA = '#1E40AF';

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * Rappel du vocal en cours, affiché quand on a quitté la conversation où il joue.
 *
 * ⚠️ Monté au niveau de l'APPLICATION (`app/_layout.tsx`) et non dans un écran : c'est
 * précisément parce qu'on quitte l'écran qu'il doit exister. Le son survit lui aussi parce
 * que le lecteur natif vit dans `lib/voicePlayback`, hors de l'arbre React — un lecteur créé
 * par `useAudioPlayer` serait libéré au démontage de la bulle.
 *
 * ⚠️ Masqué sur l'écran de chat : la bulle y montre déjà sa progression, et doubler
 * l'information encombrerait le fil. Ouvrir une AUTRE conversation arrête la lecture (voir
 * `chat/[id].tsx`) — une voix venue d'ailleurs n'a pas à se superposer à celle qu'on ouvre.
 */
export function VoiceMiniPlayer() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const playback = useVoicePlayback();

  const ratio =
    playback && playback.duration ? Math.min(1, playback.currentTime / playback.duration) : 0;

  /**
   * Barre de progression animée.
   *
   * ⚠️ Les hooks sont appelés AVANT toute sortie anticipée : les règles des hooks
   * l'imposent, et un `return null` placé plus haut les rendrait conditionnels.
   */
  const progress = useSharedValue(0);
  useEffect(() => {
    // Durée calée sur la cadence des relevés (100 ms) : la barre glisse d'un point à
    // l'autre au lieu de sauter, sans courir après la mesure suivante.
    progress.value = withTiming(ratio, { duration: 120 });
  }, [ratio, progress]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!playback) return null;
  // On ne masque QUE sur l'écran de chat : ailleurs (liste, profil, réglages) le rappel a
  // tout son sens.
  if (segments[0] === 'chat') return null;

  const { track, playing, duration, currentTime } = playback;

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        // Au-dessus de la barre d'onglets native, qui flotte par-dessus le contenu.
        bottom: insets.bottom + 58,
        zIndex: 50,
      }}
    >
      <Pressable
        onPress={() =>
          router.push({ pathname: '/chat/[id]' as any, params: { id: track.conversationId } })
        }
        style={[ROUND.bubble, FLOATING_SHADOW]}
        className="bg-white dark:bg-zinc-800 overflow-hidden"
      >
        <View className="flex-row items-center px-2.5 py-2">
          <UserAvatar
            name={track.senderName}
            photoUrl={track.photoUrl}
            size={38}
            group={track.isGroup}
          />

          <View className="flex-1 ml-2.5 mr-1">
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-gray-900 dark:text-zinc-100"
            >
              {track.senderName}
            </Text>
            {/* ⚠️ Chiffres tabulaires : sans eux, la largeur du compteur change à chaque
                seconde et le texte tressaute. */}
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-xs text-gray-400 dark:text-zinc-500"
            >
              {fmt(currentTime)} / {fmt(duration)}
            </Text>
          </View>

          {/* ⚠️ `hitSlop` généreux : ces deux boutons vivent DANS un Pressable qui ouvre la
              conversation, et un appui légèrement décalé ouvrirait le chat au lieu d'agir. */}
          <Pressable
            hitSlop={12}
            onPress={() => (playing ? pauseVoice() : playVoice(track, playback.rate))}
            className="w-10 h-10 items-center justify-center"
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color={NEXA} />
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={stopVoice}
            className="w-9 h-9 items-center justify-center"
          >
            <Ionicons name="close" size={19} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* Progression collée au bord bas : elle informe sans occuper de hauteur propre. */}
        <View className="h-[3px] bg-black/5 dark:bg-white/10">
          <Animated.View style={[progressStyle, { height: 3, backgroundColor: NEXA }]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
