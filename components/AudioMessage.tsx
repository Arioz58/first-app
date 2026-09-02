import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { enterPlaybackMode } from '../lib/audioMode';
import { VoiceWaveform, waveformFor } from './VoiceWaveform';

const BARS = 28;
const STATUS_MS = 100; // cadence des mesures de progression
// Interpolation légèrement plus longue que l'intervalle : les segments se recouvrent,
// le mouvement ne marque pas de temps d'arrêt entre deux mesures.
const SMOOTH_MS = 140;
const RATES = [1, 1.5, 2] as const;
// Emplacement du bouton, en dur : l'indicateur d'attente y prend exactement la place de
// l'icône. Sans ça, la carte du vocal changerait de largeur au moment du chargement.
const BUTTON = 39;
// Filet : un chargement qui n'aboutit jamais (fichier introuvable, réseau coupé) laisserait
// l'indicateur tourner indéfiniment. Au-delà, on rend la main — l'utilisateur peut réessayer.
const LOADING_TIMEOUT_MS = 15000;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * Lecteur de message vocal : lecture, déplacement dans l'audio et vitesse.
 *
 * ⚠️ Monté SEULEMENT après le premier appui (voir `AudioMessage` en bas de fichier).
 * `useAudioPlayer` alloue un lecteur NATIF et un abonnement de statut périodique dès le
 * montage — un par bulle vocale entrant dans la fenêtre de rendu, qu'on l'écoute ou non.
 * C'était une source mesurable de lag au défilement d'un fil contenant des vocaux : le
 * coût était payé au montage, là où la mémoïsation des lignes ne peut rien.
 */
function ActiveAudioMessage({
  uri,
  tint,
  initialRate,
  onCycleRate,
}: {
  uri: string;
  tint: string;
  initialRate: number;
  onCycleRate: (r: number) => void;
}) {
  // 500 ms par défaut : la progression n'avancerait que deux fois par seconde.
  const player = useAudioPlayer({ uri }, { updateInterval: STATUS_MS });
  const status = useAudioPlayerStatus(player);
  const scheme = useColorScheme();
  const [rateIndex, setRateIndex] = useState(Math.max(0, RATES.indexOf(initialRate as any)));

  const playing = status.playing;
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const progress = duration ? Math.min(1, current / duration) : 0;

  const levels = useMemo(() => waveformFor(uri, BARS), [uri]);

  /**
   * Attente entre l'appui et le premier son.
   *
   * ⚠️ Piloté par l'INTENTION de l'utilisateur, et non par `status.isLoaded` seul : le
   * fichier n'est chargé qu'à la première lecture, donc se fier au statut ferait tourner un
   * indicateur sur tous les vocaux jamais écoutés du fil. On ne montre l'attente qu'à celui
   * sur lequel on vient d'appuyer.
   */
  const [awaiting, setAwaiting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = awaiting && !playing;

  const stopAwaiting = () => {
    setAwaiting(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  // Le son sort : l'attente est finie.
  useEffect(() => {
    if (playing) stopAwaiting();
  }, [playing]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const toggle = () => {
    // Appui pendant le chargement : on annule. C'est la sortie naturelle si le fichier
    // tarde, et ça évite d'empiler les demandes de lecture.
    if (loading) {
      stopAwaiting();
      player.pause();
      return;
    }
    if (playing) {
      player.pause();
      return;
    }
    setAwaiting(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(stopAwaiting, LOADING_TIMEOUT_MS);
    // Filet : garantir la sortie sur le haut-parleur même si la session est restée en
    // capture (enregistrement interrompu, autre écran…). Sans ça le vocal se joue dans
    // l'écouteur téléphonique, à un volume très faible.
    enterPlaybackMode();
    // Relire depuis le début plutôt que rester bloqué sur la fin.
    if (status.didJustFinish || (duration && current >= duration - 0.05)) player.seekTo(0);
    player.play();
  };

  /**
   * Lecture lancée AU MONTAGE : ce composant n'existe que parce que l'utilisateur vient
   * d'appuyer sur lecture — le shell l'a monté pour ça. Une seule fois, jamais rejouée.
   */
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setAwaiting(true);
    timeoutRef.current = setTimeout(stopAwaiting, LOADING_TIMEOUT_MS);
    enterPlaybackMode();
    if (initialRate !== 1) player.setPlaybackRate(initialRate);
    player.play();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = (ratio: number) => {
    if (duration) player.seekTo(ratio * duration);
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    onCycleRate(RATES[next]);
    // `pitchCorrectionQuality` par défaut : la voix reste naturelle en accéléré.
    player.setPlaybackRate(RATES[next]);
  };

  const rate = RATES[rateIndex];

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


/**
 * Coquille inerte d'un vocal : même mise en page, ZÉRO ressource native.
 *
 * ⚠️ C'est elle que le fil monte pendant le défilement. Le lecteur natif
 * (`ActiveAudioMessage`) n'est créé qu'au premier appui sur lecture — et une fois créé, il
 * reste monté : re-basculer vers la coquille perdrait la position d'écoute.
 */
export function AudioMessage({
  uri,
  tint,
  durationMs,
}: {
  uri: string;
  tint: string;
  /** Durée connue du message (colonne `durationMs`) : affichée avant tout chargement. */
  durationMs?: number | null;
}) {
  const scheme = useColorScheme();
  const [armed, setArmed] = useState(false);
  // La vitesse se règle AVANT d'écouter (voir la note sur la pastille) : elle vit donc ici,
  // survit au montage du lecteur, et lui est transmise.
  const [rate, setRate] = useState<number>(RATES[0]);
  const levels = useMemo(() => waveformFor(uri, BARS), [uri]);

  if (armed) {
    return <ActiveAudioMessage uri={uri} tint={tint} initialRate={rate} onCycleRate={setRate} />;
  }

  return (
    <View className="flex-row items-center" style={{ minWidth: 210 }}>
      <TouchableOpacity
        onPress={() => setArmed(true)}
        className="mr-2 items-center justify-center"
        style={{ width: BUTTON, height: BUTTON }}
        hitSlop={6}
      >
        <Ionicons name="play-circle" size={BUTTON} color={tint} />
      </TouchableOpacity>

      <View className="flex-1">
        <VoiceWaveform
          levels={levels}
          progress={0}
          tint={tint}
          idleColor={scheme === 'dark' ? '#52525b' : '#d4d4d8'}
          smoothMs={SMOOTH_MS}
          showCursor={false}
          // Chercher dans un vocal jamais chargé = vouloir l'écouter : on arme.
          onSeek={() => setArmed(true)}
        />
        <View className="flex-row items-center mt-1">
          <Text className="text-xs text-gray-500 dark:text-zinc-400">
            {durationMs ? fmt(durationMs / 1000) : '0:00'}
          </Text>
          <TouchableOpacity
            onPress={() => setRate(RATES[(RATES.indexOf(rate as any) + 1) % RATES.length])}
            hitSlop={10}
            className="ml-auto"
          >
            <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: tint }}>
              <Text className="text-xs font-bold text-white">{rate}×</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
