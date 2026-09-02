import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUND } from '../lib/radius';
import { useNowPlaying } from '../lib/voicePlayback';
import { FLOATING_SHADOW } from './GlassSurface';

/**
 * Rappel du vocal en cours, affiché quand on a quitté la conversation où il joue.
 *
 * ⚠️ Monté au niveau de l'APPLICATION (`app/_layout.tsx`) et non dans un écran : c'est
 * précisément parce qu'on quitte l'écran qu'il doit exister. Le son, lui, continue tout
 * seul — `expo-audio` ne s'arrête pas quand une vue disparaît de l'affichage.
 *
 * ⚠️ Masqué tant qu'on EST dans la conversation qui joue : la bulle y montre déjà sa
 * progression, et doubler l'information encombrerait le fil pour rien.
 */
export function VoiceMiniPlayer() {
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const playing = useNowPlaying();

  if (!playing) return null;

  // `segments` vaut par exemple ['chat', '[id]'] : on ne sait pas quel id est ouvert. Le
  // relais passe donc par le paramètre, lu depuis l'URL courante côté router.
  const onChatScreen = segments[0] === 'chat';
  // ⚠️ On ne masque QUE sur l'écran de chat : ailleurs (liste, profil, réglages) le rappel
  // a tout son sens. Comparer l'identifiant exact demanderait de lire les paramètres de
  // route, qui ne sont pas exposés ici — et rester visible sur une AUTRE conversation est
  // le comportement voulu de toute façon.
  if (onChatScreen) return null;

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
          router.push({
            pathname: '/chat/[id]' as any,
            params: { id: playing.conversationId },
          })
        }
        style={[ROUND.bubble, FLOATING_SHADOW]}
        className="flex-row items-center bg-white dark:bg-zinc-800 px-3 py-2.5"
      >
        <View className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/40 items-center justify-center">
          <Ionicons name="volume-medium" size={17} color="#1E40AF" />
        </View>
        <View className="flex-1 ml-2.5">
          <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
            {playing.senderName || t('chat.quote_audio')}
          </Text>
          <Text className="text-xs text-gray-400 dark:text-zinc-500">
            {t('chat.playing_tap_to_open')}
          </Text>
        </View>
        {/* ⚠️ `stop` vient du lecteur lui-même : c'est lui qui détient le player natif, le
            store ne transporte que le rappel. */}
        <Pressable
          hitSlop={10}
          onPress={playing.stop}
          className="w-9 h-9 items-center justify-center"
        >
          <Ionicons name="pause" size={19} color="#6B7280" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
