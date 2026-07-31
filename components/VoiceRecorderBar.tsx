import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { enterPlaybackMode, enterRecordingMode } from '../lib/audioMode';
import { LiveWaveform } from './VoiceWaveform';

const NEXA = '#1E40AF';
const BARS = 34; // fenêtre glissante, de longueur FIXE (cf. LiveWaveform)
const TICK_MS = 80; // cadence de lecture du niveau sonore
const MIN_MS = 1000; // en deçà, c'est un appui accidentel
const FLOOR = 0.06; // hauteur d'une barre silencieuse

// `metering` est en décibels. La plage utile de la voix se situe plutôt vers -45 → -5 dB :
// prise sur -60 → 0 en linéaire, elle s'écrase autour du milieu et le tracé paraît plat.
// On resserre la plage et on accentue la courbe pour rendre les variations lisibles.
const levelFromMetering = (db?: number) => {
  if (db == null) return FLOOR;
  const norm = (Math.max(-50, Math.min(0, db)) + 50) / 50; // 0 → 1
  return FLOOR + Math.pow(norm, 1.6) * (1 - FLOOR);
};

const fmt = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Barre d'enregistrement d'un message vocal : niveau sonore en direct, chrono,
 * pause/reprise, annulation et envoi.
 *
 * Composant à part et non bloc inline du chat : l'état de l'enregistreur se rafraîchit
 * dix fois par seconde, ce qui ferait re-rendre tout l'écran de conversation à cette
 * cadence s'il vivait dans le même composant.
 */
export function VoiceRecorderBar({
  onCancel,
  onSend,
}: {
  onCancel: () => void;
  onSend: (uri: string, durationMs: number) => void;
}) {
  // Le metering doit être demandé explicitement : sans lui, pas de niveau à afficher.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, TICK_MS);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(FLOOR));
  const [paused, setPaused] = useState(false);
  const startedRef = useRef(false);

  // Démarrage au montage : le parent n'affiche cette barre qu'une fois la permission
  // accordée, il n'y a donc rien à redemander ici.
  useEffect(() => {
    let alive = true;
    (async () => {
      await enterRecordingMode();
      await recorder.prepareToRecordAsync();
      if (!alive) return;
      recorder.record();
      startedRef.current = true;
    })();
    return () => {
      alive = false;
      // Filet : ne jamais laisser le micro ouvert ni la session en capture si la barre
      // disparaît autrement (retour arrière, changement d'écran…).
      if (startedRef.current) recorder.stop().catch(() => {});
      enterPlaybackMode();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fenêtre glissante à longueur constante : on pousse la nouvelle mesure et on retire la
  // plus ancienne. Chaque barre hérite ainsi de la valeur de sa voisine, ce dont
  // LiveWaveform tire son défilement continu.
  useEffect(() => {
    if (!state.isRecording) return;
    setLevels((prev) => [...prev.slice(1), levelFromMetering(state.metering)]);
  }, [state.metering, state.isRecording]);

  const togglePause = () => {
    if (paused) {
      recorder.record();
      setPaused(false);
    } else {
      recorder.pause();
      setPaused(true);
    }
  };

  const cancel = async () => {
    startedRef.current = false;
    await recorder.stop().catch(() => {});
    await enterPlaybackMode();
    onCancel();
  };

  const send = async () => {
    const durationMs = state.durationMillis;
    startedRef.current = false;
    try {
      await recorder.stop();
    } catch {
      // on tente quand même de récupérer l'uri ci-dessous
    }
    await enterPlaybackMode();
    const uri = recorder.uri;
    if (!uri || durationMs < MIN_MS) {
      onCancel();
      return;
    }
    onSend(uri, durationMs);
  };

  return (
    <View className="flex-row items-center px-3 py-3 border-t border-gray-100 dark:border-zinc-800">
      <TouchableOpacity onPress={cancel} className="px-2" hitSlop={6}>
        <Ionicons name="trash-outline" size={22} color="#EF4444" />
      </TouchableOpacity>

      <TouchableOpacity onPress={togglePause} className="px-2" hitSlop={6}>
        <Ionicons name={paused ? 'play' : 'pause'} size={20} color={NEXA} />
      </TouchableOpacity>

      <View className="flex-1 flex-row items-center ml-1">
        {/* Le point ne clignote qu'en enregistrement effectif. */}
        <View
          className={`w-2.5 h-2.5 rounded-full mr-2 ${paused ? 'bg-gray-400' : 'bg-red-500'}`}
        />
        <Text className="text-gray-700 dark:text-zinc-300 mr-2" style={{ fontVariant: ['tabular-nums'] }}>
          {fmt(state.durationMillis)}
        </Text>
        <View className="flex-1">
          {/* Le tracé se fige de lui-même en pause : plus de mesure, donc plus de
              glissement — et la couleur passe au gris pour le dire. */}
          <LiveWaveform
            levels={levels}
            color={paused ? '#9CA3AF' : NEXA}
            height={24}
            durationMs={TICK_MS}
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={send}
        className="w-11 h-11 bg-nexa rounded-full items-center justify-center ml-2"
      >
        <Ionicons name="send" size={20} color="white" />
      </TouchableOpacity>
    </View>
  );
}
