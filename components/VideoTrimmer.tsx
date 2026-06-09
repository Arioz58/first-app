import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { isValidFile, trim } from "react-native-video-trim";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const N_THUMBS = 8;
const MIN_TRIM_MS = 1000; // durée minimale d'une sélection
const HANDLE_W = 16;
const TRACK_H = 56;

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VideoTrimmer({
  uri,
  onConfirm,
  onCancel,
}: {
  uri: string;
  onConfirm: (trimmedUri: string) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });

  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [trackW, setTrackW] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [startLabel, setStartLabel] = useState(0);
  const [endLabel, setEndLabel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Bornes courantes (ms) accessibles côté JS (boucle de preview + validation)
  const startMsRef = useRef(0);
  const endMsRef = useRef(0);

  // Timeline (UI thread)
  const startX = useSharedValue(0);
  const endX = useSharedValue(0);
  const savedStartX = useSharedValue(0);
  const savedEndX = useSharedValue(0);
  const trackWSV = useSharedValue(0);
  const durMsSV = useSharedValue(0);

  const ready = durationMs != null && trackW > 0;

  // ── Durée + miniatures ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      let durMs = 0;
      try {
        const info = await isValidFile(uri);
        durMs = info?.duration && info.duration > 0 ? info.duration : 0;
      } catch {
        // ignore
      }
      if (!durMs) durMs = (player.duration || 0) * 1000;
      if (!durMs || !active) return;
      setDurationMs(durMs);
      durMsSV.value = durMs;
      endMsRef.current = durMs;
      setEndLabel(durMs);

      for (let i = 0; i < N_THUMBS; i++) {
        const t = Math.round((i / (N_THUMBS - 1)) * durMs);
        try {
          const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, {
            time: t,
          });
          if (!active) return;
          setThumbs((prev) => [...prev, thumb]);
        } catch {
          // miniature ignorée
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // Démarre la lecture une fois prête
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") player.play();
    });
    return () => sub.remove();
  }, [player]);

  // Suit l'état lecture/pause pour l'icône
  useEffect(() => {
    const sub = player.addListener("playingChange", ({ isPlaying: p }) => {
      setIsPlaying(p);
    });
    return () => sub.remove();
  }, [player]);

  const togglePlay = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  // Boucle de lecture sur la sélection
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      const cur = currentTime * 1000;
      if (cur >= endMsRef.current - 30 || cur < startMsRef.current - 150) {
        player.currentTime = startMsRef.current / 1000;
      }
    });
    return () => sub.remove();
  }, [player]);

  // Initialise les poignées quand durée + largeur sont connues
  useEffect(() => {
    if (ready) {
      startX.value = 0;
      endX.value = trackW;
      trackWSV.value = trackW;
      startMsRef.current = 0;
      endMsRef.current = durationMs!;
      setStartLabel(0);
      setEndLabel(durationMs!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, trackW, durationMs]);

  // ── Callbacks stables (pour des gestes non recréés à chaque render) ─────────
  const seekTo = useCallback(
    (ms: number) => {
      player.currentTime = ms / 1000;
    },
    [player],
  );
  const pausePreview = useCallback(() => player.pause(), [player]);
  const playPreview = useCallback(() => player.play(), [player]);
  const commitStart = useCallback((ms: number) => {
    startMsRef.current = ms;
    setStartLabel(ms);
  }, []);
  const commitEnd = useCallback((ms: number) => {
    endMsRef.current = ms;
    setEndLabel(ms);
  }, []);

  const leftPan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          savedStartX.value = startX.value;
          runOnJS(pausePreview)();
        })
        .onUpdate((e) => {
          if (durMsSV.value <= 0) return;
          const minPx = (MIN_TRIM_MS / durMsSV.value) * trackWSV.value;
          let nx = savedStartX.value + e.translationX;
          nx = Math.max(0, Math.min(nx, endX.value - minPx));
          startX.value = nx;
          runOnJS(seekTo)((nx / trackWSV.value) * durMsSV.value);
        })
        .onEnd(() => {
          const ms = (startX.value / trackWSV.value) * durMsSV.value;
          runOnJS(commitStart)(ms);
          runOnJS(seekTo)(ms);
          runOnJS(playPreview)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pausePreview, seekTo, commitStart, playPreview],
  );

  const rightPan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          savedEndX.value = endX.value;
          runOnJS(pausePreview)();
        })
        .onUpdate((e) => {
          if (durMsSV.value <= 0) return;
          const minPx = (MIN_TRIM_MS / durMsSV.value) * trackWSV.value;
          let nx = savedEndX.value + e.translationX;
          nx = Math.min(trackWSV.value, Math.max(nx, startX.value + minPx));
          endX.value = nx;
          runOnJS(seekTo)((nx / trackWSV.value) * durMsSV.value);
        })
        .onEnd(() => {
          const ms = (endX.value / trackWSV.value) * durMsSV.value;
          // Calcule le début depuis la shared value (ne PAS lire startMsRef dans un
          // worklet → warning « Tried to modify key current … »)
          const sMs = (startX.value / trackWSV.value) * durMsSV.value;
          runOnJS(commitEnd)(ms);
          runOnJS(seekTo)(sMs);
          runOnJS(playPreview)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pausePreview, seekTo, commitEnd, playPreview],
  );

  // ── Styles animés ──────────────────────────────────────────────────────────
  const leftMaskStyle = useAnimatedStyle(() => ({ width: startX.value }));
  const rightMaskStyle = useAnimatedStyle(() => ({
    left: endX.value,
    width: Math.max(0, trackWSV.value - endX.value),
  }));
  const selStyle = useAnimatedStyle(() => ({
    left: startX.value,
    width: Math.max(0, endX.value - startX.value),
  }));
  const leftHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: startX.value }],
  }));
  const rightHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: endX.value - HANDLE_W }],
  }));

  // ── Validation (vrai découpage) ─────────────────────────────────────────────
  const onValidate = async () => {
    if (processing || !durationMs) return;
    const startMs = Math.round(startMsRef.current);
    const endMs = Math.round(endMsRef.current);
    // Aucun rognage → on garde l'original
    if (startMs <= 30 && endMs >= durationMs - 30) {
      onConfirm(uri);
      return;
    }
    setProcessing(true);
    try {
      // enablePreciseTrimming : ré-encodage frame-accurate (sinon le découpage se
      // cale sur les keyframes et le début « dérive », souvent jusqu'à 0).
      const res = await trim(uri, {
        startTime: startMs,
        endTime: endMs,
        enablePreciseTrimming: true,
      });
      if (res?.success && res.outputPath) {
        const out = res.outputPath.startsWith("file://")
          ? res.outputPath
          : `file://${res.outputPath}`;
        onConfirm(out);
      } else {
        onConfirm(uri);
      }
    } catch {
      onConfirm(uri);
    } finally {
      setProcessing(false);
    }
  };

  const selectionMs = Math.max(0, endLabel - startLabel);

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}
      >
        <TouchableOpacity onPress={onCancel} hitSlop={10} disabled={processing}>
          <Ionicons name="close" size={30} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-base font-semibold">Rogner</Text>
        <TouchableOpacity onPress={onValidate} disabled={processing || !ready}>
          <View className="bg-nexa px-4 py-2 rounded-full">
            <Text className="text-white font-semibold">Suivant</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <View style={{ flex: 1 }}>
        <VideoView
          player={player}
          style={{ flex: 1 }}
          contentFit="contain"
          nativeControls={false}
        />
        {/* Tap = lecture / pause */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={togglePlay}
          className="items-center justify-center"
        >
          {!isPlaying && (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "rgba(0,0,0,0.45)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="play" size={34} color="white" style={{ marginLeft: 3 }} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Timeline */}
      <View style={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}>
        <View className="flex-row justify-between mb-2 px-1">
          <Text className="text-white/60 text-xs">{fmt(startLabel)}</Text>
          <Text className="text-white text-xs font-medium">
            {fmt(selectionMs)}
          </Text>
          <Text className="text-white/60 text-xs">{fmt(endLabel)}</Text>
        </View>

        <View
          style={[styles.track, { height: TRACK_H }]}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        >
          {/* Miniatures */}
          <View style={StyleSheet.absoluteFill} className="flex-row overflow-hidden rounded-lg">
            {thumbs.map((t, i) => (
              <Image key={i} source={{ uri: t }} style={{ flex: 1 }} />
            ))}
          </View>

          {ready && (
            <>
              {/* Masques hors-sélection */}
              <Reanimated.View style={[styles.mask, { left: 0 }, leftMaskStyle]} />
              <Reanimated.View style={[styles.mask, rightMaskStyle]} />

              {/* Cadre de sélection */}
              <Reanimated.View style={[styles.selection, selStyle]} />

              {/* Poignées */}
              <GestureDetector gesture={leftPan}>
                <Reanimated.View style={[styles.handle, styles.handleLeft, leftHandleStyle]}>
                  <View style={styles.grip} />
                </Reanimated.View>
              </GestureDetector>
              <GestureDetector gesture={rightPan}>
                <Reanimated.View style={[styles.handle, styles.handleRight, rightHandleStyle]}>
                  <View style={styles.grip} />
                </Reanimated.View>
              </GestureDetector>
            </>
          )}
        </View>

        {!ready && (
          <View className="items-center mt-3">
            <ActivityIndicator color="white" />
          </View>
        )}
      </View>

      {/* Overlay de traitement */}
      {processing && (
        <View
          style={StyleSheet.absoluteFill}
          className="bg-black/70 items-center justify-center"
        >
          <ActivityIndicator size="large" color="white" />
          <Text className="text-white mt-3">Découpage…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: 10,
    backgroundColor: "#111",
  },
  mask: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  selection: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: "#128C7E",
    borderRadius: 6,
  },
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: HANDLE_W,
    backgroundColor: "#128C7E",
    alignItems: "center",
    justifyContent: "center",
  },
  handleLeft: {
    left: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  handleRight: {
    left: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  grip: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: "white",
  },
});
