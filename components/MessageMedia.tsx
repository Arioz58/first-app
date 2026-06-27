import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Text, TouchableOpacity, View } from 'react-native';
import { formatFileSize } from '../lib/upload';
import { AudioMessage } from './AudioMessage';

type MediaMessage = {
  mediaUrl?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
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
          style={{ width: 220, height: 220, borderRadius: 12 }}
          contentFit="cover"
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
          width: 220,
          height: 260,
          borderRadius: 12,
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
    return <AudioMessage uri={mediaUrl} tint={tint} />;
  }

  // Document
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(mediaUrl)}
      className="flex-row items-center"
      style={{ minWidth: 200 }}
      activeOpacity={0.7}
    >
      <Ionicons name="document-text" size={30} color={tint} />
      <View className="ml-2 flex-1">
        <Text numberOfLines={1} className="text-gray-900 font-medium">
          {message.fileName || 'Document'}
        </Text>
        {message.fileSize ? (
          <Text className="text-gray-400 text-xs">{formatFileSize(message.fileSize)}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
