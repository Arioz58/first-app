import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { isViewableDocument } from '../lib/documents';
import { ROUND } from '../lib/radius';
import { formatFileSize } from '../lib/upload';
import { AudioMessage } from './AudioMessage';
import { DocumentViewer } from './DocumentViewer';
import { MEDIA_FADE_MS, MEDIA_PLACEHOLDER } from '../lib/mediaAppearance';

type MediaMessage = {
  mediaUrl?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  durationMs?: number | null;
};

// Rendu de la pièce jointe d'un message dans la bulle, selon son type.
export function MessageMedia({
  message,
  tint,
  onOpenImage,
  onOpenVideo,
}: {
  message: MediaMessage;
  tint: string;
  onOpenImage: (url: string) => void;
  onOpenVideo: (url: string) => void;
}) {
  const { mediaUrl, mediaType } = message;
  if (!mediaUrl) return null;

  if (mediaType === 'image' || mediaType === 'gif') {
    return (
      <TouchableOpacity onPress={() => onOpenImage(mediaUrl)} activeOpacity={0.9}>
        <Image
          source={{ uri: mediaUrl }}
          style={{ width: 244, height: 244, ...ROUND.media, backgroundColor: MEDIA_PLACEHOLDER }}
          contentFit="cover"
          transition={MEDIA_FADE_MS}
        />
      </TouchableOpacity>
    );
  }

  if (mediaType === 'video') {
    return (
      <TouchableOpacity
        onPress={() => onOpenVideo(mediaUrl)}
        activeOpacity={0.9}
        style={{
          width: 244,
          height: 288,
          ...ROUND.media,
          backgroundColor: '#111827',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="play-circle" size={56} color="white" />
      </TouchableOpacity>
    );
  }

  if (mediaType === 'audio') {
    // ⚠️ `key` d'identité : sous FlashList, un support recyclé garde son état interne — un
    // lecteur « armé » (donc natif, en cours de lecture) suivrait le support jusqu'à un
    // AUTRE vocal. La clé force le remontage quand l'uri change.
    return <AudioMessage key={mediaUrl} uri={mediaUrl} tint={tint} durationMs={message.durationMs} />;
  }

  // Document
  return <DocumentCard message={message} url={mediaUrl} tint={tint} />;
}

/**
 * Carte d'un document : ouvre la visionneuse intégrée. Celle-ci gère elle-même le repli
 * vers le téléchargement quand le format n'est pas affichable — l'icône annonce
 * simplement à quoi s'attendre.
 */
function DocumentCard({
  message,
  url,
  tint,
}: {
  message: MediaMessage;
  url: string;
  tint: string;
}) {
  const [open, setOpen] = useState(false);
  const viewable = isViewableDocument(message.fileName, url);

  return (
    <TouchableOpacity
      onPress={() => setOpen(true)}
      className="flex-row items-center"
      style={{ minWidth: 200 }}
      activeOpacity={0.7}
    >
      <Ionicons name="document-text" size={33} color={tint} />
      <View className="ml-2 flex-1">
        <Text numberOfLines={1} className="text-base text-gray-900 dark:text-zinc-100 font-medium">
          {message.fileName || 'Document'}
        </Text>
        {message.fileSize ? (
          <Text className="text-gray-400 dark:text-zinc-500 text-sm">{formatFileSize(message.fileSize)}</Text>
        ) : null}
      </View>

      {/* L'icône annonce ce qui va se passer : lecture intégrée ou enregistrement. */}
      <View className="ml-2 w-6 items-center">
        <Ionicons name={viewable ? 'eye-outline' : 'download-outline'} size={19} color={tint} />
      </View>

      {open && (
        <DocumentViewer
          url={url}
          fileName={message.fileName}
          fileSize={message.fileSize}
          onClose={() => setOpen(false)}
        />
      )}
    </TouchableOpacity>
  );
}
