import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { enterPlaybackMode } from '../lib/audioMode';
import { VoiceWaveform, waveformFor } from './VoiceWaveform';

const BARS = 28;
const STATUS_MS = 100; // cadence des mesures de progression
// Interpolation légèrement plus longue que l'intervalle : les segments se recouvrent,
// le mouvement ne marque pas de temps d'arrêt entre deux mesures.
const SMOOTH_MS = 140;
const RATES = [1, 1.5, 2] as const;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// Lecteur de message vocal : lecture, déplacement dans l'audio et vitesse.
export function AudioMessage({ uri, tint }: { uri: string; tint: string }) {
  // 500 ms par défaut : la progression n'avancerait que deux fois par seconde.
  const player = useAudioPlayer({ uri }, { updateInterval: STATUS_MS });
  const status = useAudioPlayerStatus(player);
  const scheme = useColorScheme();
  const [rateIndex, setRateIndex] = useState(0);

  const playing = status.playing;
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const progress = duration ? Math.min(1, current / duration) : 0;

  const levels = useMemo(() => waveformFor(uri, BARS), [uri]);

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    // Filet : garantir la sortie sur le haut-parleur même si la session est restée en
    // capture (enregistrement interrompu, autre écran…). Sans ça le vocal se joue dans
    // l'écouteur téléphonique, à un volume très faible.
    enterPlaybackMode();
    // Relire depuis le début plutôt que rester bloqué sur la fin.
    if (status.didJustFinish || (duration && current >= duration - 0.05)) player.seekTo(0);
    player.play();
  };

  const seek = (ratio: number) => {
    if (duration) player.seekTo(ratio * duration);
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    // `pitchCorrectionQuality` par défaut : la voix reste naturelle en accéléré.
    player.setPlaybackRate(RATES[next]);
  };

  const rate = RATES[rateIndex];

  return (
    <View className="flex-row items-center" style={{ minWidth: 210 }}>
      <TouchableOpacity onPress={toggle} className="mr-2" hitSlop={6}>
        <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={39} color={tint} />
      </TouchableOpacity>

      <View className="flex-1">
        <VoiceWaveform
          levels={levels}
          progress={progress}
          tint={tint}
          idleColor={scheme === 'dark' ? '#52525b' : '#d4d4d8'}
          smoothMs={SMOOTH_MS}
          showCursor
          onSeek={seek}
        />
        <View className="flex-row items-center mt-1">
          <Text className="text-xs text-gray-500 dark:text-zinc-400">
            {fmt(current > 0 ? current : duration)}
          </Text>
          {/* Toujours présente, même avant lecture : c'est un réglage qu'on veut pouvoir
              poser AVANT d'écouter, et une commande qui apparaît en cours de route se
              remarque mal. Pastille pleine en permanence — sur une carte claire, un fond
              teinté dilué se confond avec elle. */}
          <TouchableOpacity onPress={cycleRate} hitSlop={10} className="ml-auto">
            <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: tint }}>
              <Text className="text-xs font-bold text-white">{rate}×</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
