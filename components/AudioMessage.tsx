import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Text, TouchableOpacity, View } from 'react-native';

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// Lecteur de message vocal : play/pause + barre de progression + durée.
export function AudioMessage({ uri, tint }: { uri: string; tint: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const playing = status.playing;
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const progress = duration ? Math.min(1, current / duration) : 0;

  const toggle = () => {
    if (playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (duration && current >= duration)) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View className="flex-row items-center" style={{ minWidth: 170 }}>
      <TouchableOpacity onPress={toggle} className="mr-2">
        <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={36} color={tint} />
      </TouchableOpacity>
      <View className="flex-1">
        <View className="h-1 rounded-full bg-black/10">
          <View
            className="h-1 rounded-full"
            style={{ width: `${progress * 100}%`, backgroundColor: tint }}
          />
        </View>
        <Text className="text-[11px] text-gray-500 mt-1">
          {fmt(current > 0 ? current : duration)}
        </Text>
      </View>
    </View>
  );
}
