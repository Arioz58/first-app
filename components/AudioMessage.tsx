import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import {
  pauseVoice,
  playVoice,
  seekVoice,
  setVoiceRate,
  useVoicePlayback,
  type VoiceTrack,
} from '../lib/voicePlayback';
import { useBubbleGestures } from '../lib/bubbleGesture';
import { VoiceWaveform, waveformFor } from './VoiceWaveform';

const BARS = 28;
// Interpolation légèrement plus longue que l'intervalle de mesure : les segments se
// recouvrent, le mouvement ne marque pas de temps d'arrêt entre deux relevés.
const SMOOTH_MS = 140;
const RATES = [1, 1.5, 2] as const;
// Emplacement du bouton, en dur : l'indicateur d'attente y prend exactement la place de
// l'icône. Sans ça, la carte du vocal changerait de largeur au moment du chargement.
const BUTTON = 39;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * Lecteur de message vocal.
 *
 * ⚠️ Ce composant ne POSSÈDE plus de lecteur : il affiche l'état du lecteur applicatif
 * (`lib/voicePlayback`) et lui envoie des ordres. C'est ce qui permet au son de survivre à
 * la sortie de la conversation — un lecteur créé par `useAudioPlayer` serait libéré au
 * démontage de la bulle, et le mini-player n'aurait plus rien à contrôler.
 *
 * Effet de bord bienvenu : plus rien de natif n'est alloué au défilement. La coquille inerte
 * qu'on avait introduite pour ça n'a plus lieu d'être — toutes les bulles sont inertes.
 */
export function AudioMessage({
  uri,
  tint,
  durationMs,
  track,
}: {
  uri: string;
  tint: string;
  /** Durée connue du message (colonne `durationMs`) : affichée avant tout chargement. */
  durationMs?: number | null;
  /** Identité du message. Absente (aperçu, galerie) : la bulle reste décorative. */
  track?: Omit<VoiceTrack, 'uri' | 'durationMs'>;
}) {
  const scheme = useColorScheme();
  const playback = useVoicePlayback();
  // Le glissement dans l'onde doit l'emporter sur celui de la bulle (« répondre »).
  const bubbleGestures = useBubbleGestures();
  const levels = useMemo(() => waveformFor(uri, BARS), [uri]);

  // Est-ce CE message que le lecteur applicatif tient ?
  const active = !!track && playback?.track.messageId === track.messageId;
  const playing = active && playback!.playing;
  const loading = active && playback!.loading;
  const duration = (active && playback!.duration) || (durationMs ?? 0) / 1000;
  const current = active ? playback!.currentTime : 0;
  const progress = duration ? Math.min(1, current / duration) : 0;
  const rate = active ? playback!.rate : RATES[0];

  const toggle = () => {
    if (!track) return;
    if (playing || loading) {
      pauseVoice();
      return;
    }
    playVoice({ ...track, uri, durationMs }, rate);
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
    // Régler la vitesse sur un vocal qu'on n'écoute pas encore n'a nulle part où vivre :
    // on ne l'applique donc qu'au vocal actif. (Le réglage se pose avant l'écoute une fois
    // celle-ci lancée, ce qui reste le cas d'usage courant.)
    if (active) setVoiceRate(next);
  };

  return (
    <View className="flex-row items-center" style={{ minWidth: 210 }}>
      <TouchableOpacity
        onPress={toggle}
        className="mr-2 items-center justify-center"
        style={{ width: BUTTON, height: BUTTON }}
        hitSlop={6}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={BUTTON} color={tint} />
        )}
      </TouchableOpacity>

      <View className="flex-1">
        <VoiceWaveform
          levels={levels}
          progress={progress}
          tint={tint}
          idleColor={scheme === 'dark' ? '#52525b' : '#d4d4d8'}
          smoothMs={SMOOTH_MS}
          showCursor={active}
          blockGestures={bubbleGestures}
          // Chercher dans un vocal qu'on n'écoute pas encore = vouloir l'écouter.
          onSeek={(ratio) => {
            if (active) seekVoice(ratio);
            else if (track) playVoice({ ...track, uri, durationMs }, rate);
          }}
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
