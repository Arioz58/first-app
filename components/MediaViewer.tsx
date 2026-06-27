import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';

// Visionneuse plein écran d'une pièce jointe image ou vidéo (montée à la demande).
export function MediaViewer({
  type,
  url,
  onClose,
}: {
  type: 'image' | 'video';
  url: string;
  onClose: () => void;
}) {
  const player = useVideoPlayer(type === 'video' ? url : null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (type === 'video') player.play();
  }, [type, player]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black items-center justify-center" onPress={onClose}>
        <View className="absolute top-14 right-5 z-10">
          <Ionicons name="close" size={30} color="white" />
        </View>
        {type === 'image' ? (
          <Image source={{ uri: url }} style={{ width: '100%', height: '85%' }} contentFit="contain" />
        ) : (
          <VideoView
            player={player}
            style={{ width: '100%', height: '72%' }}
            contentFit="contain"
            nativeControls
            allowsFullscreen
          />
        )}
      </Pressable>
    </Modal>
  );
}
