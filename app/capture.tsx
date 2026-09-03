import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ForwardSheet } from '../components/ForwardSheet';
import { StoryCamera, type CapturedMedia } from '../components/StoryCamera';
import { getSocket } from '../lib/socket';
import { useThemeColors } from '../lib/theme';
import { uploadFile } from '../lib/upload';

/**
 * Raccourci appareil photo depuis l'en-tête de l'onglet Discussion.
 *
 * Capture → choix de la destination : plusieurs conversations, ou sa story.
 *
 * ⚠️ Écran à part et non un état de l'onglet Discussion : la caméra est plein écran et
 * garde son propre cycle de vie (permissions, objectif, enregistrement). L'imbriquer dans un
 * onglet la ferait monter et démonter au gré des changements d'onglet.
 *
 * ⚠️ La VIDÉO est acceptée aussi, bien que l'accès s'appelle « photo » : `StoryCamera`
 * enregistre au maintien du doigt, c'est une affordance visible du composant. La refuser
 * après coup donnerait un maintien sans effet, ce qui se lit comme un bug.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [captured, setCaptured] = useState<CapturedMedia | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const isVideo = !!captured && captured.mimeType.startsWith('video/');

  /**
   * ⚠️ Le lecteur est créé inconditionnellement (source `null` tant qu'il n'y a pas de
   * vidéo) : `useVideoPlayer` est un hook, il ne peut pas être appelé derrière une condition.
   */
  const player = useVideoPlayer(isVideo ? captured!.uri : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const goToStory = () => {
    if (!captured) return;
    /**
     * ⚠️ `replace` et non `push` : revenir en arrière depuis l'éditeur doit ramener à la
     * liste des discussions, pas à un aperçu de photo déjà consommé.
     */
    router.replace({
      pathname: '/story/create' as any,
      params: {
        uri: captured.uri,
        mimeType: captured.mimeType,
        width: String(captured.width),
        height: String(captured.height),
      },
    });
  };

  const sendTo = async (conversationIds: string[]) => {
    if (!captured || !conversationIds.length) return;
    setPickerOpen(false);
    setSending(true);
    try {
      /**
       * ⚠️ UN SEUL téléversement, réutilisé pour toutes les conversations — même principe
       * que le transfert d'un message. Téléverser par destinataire multiplierait le temps
       * d'attente et le stockage S3 pour un fichier identique.
       */
      const url = await uploadFile(captured.uri, captured.mimeType, 'chat');
      const socket = getSocket();
      if (!socket) throw new Error('socket');

      for (const conversationId of conversationIds) {
        socket.emit('send_message', {
          conversationId,
          content: '',
          mediaUrl: url,
          mediaType: isVideo ? 'video' : 'image',
          mimeType: captured.mimeType,
        });
      }

      router.back();
      /**
       * Confirmation APRÈS le retour : l'écran de capture disparaît, et l'utilisateur voit
       * le message arriver dans sa liste — l'alerte ne fait que nommer ce qui vient de se
       * produire.
       */
      Alert.alert(
        conversationIds.length > 1
          ? t('capture.sent_many', { count: conversationIds.length })
          : t('capture.sent_one'),
      );
    } catch {
      Alert.alert(t('error'), t('capture.send_error'));
    } finally {
      setSending(false);
    }
  };

  if (!captured) {
    return <StoryCamera onCapture={setCaptured} onClose={() => router.back()} />;
  }

  return (
    <View className="flex-1 bg-black">
      {isVideo ? (
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
      ) : (
        <Image source={{ uri: captured.uri }} style={{ flex: 1 }} contentFit="contain" />
      )}

      {/* Reprendre — revient à la caméra sans quitter l'écran. */}
      <TouchableOpacity
        onPress={() => setCaptured(null)}
        style={{ top: insets.top + 8 }}
        className="absolute left-4 flex-row items-center rounded-full bg-black/50 px-4 py-2"
      >
        <Ionicons name="camera-reverse" size={18} color="#fff" />
        <Text className="ml-2 text-white font-medium">{t('capture.retake')}</Text>
      </TouchableOpacity>

      <View
        style={{ paddingBottom: insets.bottom + 16 }}
        className="absolute inset-x-0 bottom-0 flex-row gap-3 px-4 pt-4"
      >
        <TouchableOpacity
          disabled={sending}
          onPress={goToStory}
          className="flex-1 flex-row items-center justify-center rounded-2xl bg-white/15 py-4"
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text className="ml-2 text-white text-base font-semibold">{t('capture.my_story')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={sending}
          onPress={() => setPickerOpen(true)}
          className="flex-1 flex-row items-center justify-center rounded-2xl bg-nexa py-4"
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text className="ml-2 text-white text-base font-semibold">
                {t('capture.send_to')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ForwardSheet
        visible={pickerOpen}
        title={t('capture.send_to')}
        onClose={() => setPickerOpen(false)}
        onConfirm={(ids) => void sendTo(ids)}
      />

      {sending && (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <ActivityIndicator color={colors.nexa} size="large" />
          <Text className="mt-3 text-white">{t('capture.sending')}</Text>
        </View>
      )}
    </View>
  );
}
