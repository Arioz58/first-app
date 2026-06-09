import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type CapturedMedia = {
  uri: string;
  mimeType: string;
  width: number;
  height: number;
};

type Facing = "back" | "front";
type Flash = "off" | "on" | "auto";

const MAX_VIDEO_SEC = 30;
// Distance (px) à glisser vers le haut pour verrouiller l'enregistrement
const LOCK_THRESHOLD = 90;

const flashIcon: Record<Flash, keyof typeof Ionicons.glyphMap> = {
  off: "flash-off",
  on: "flash",
  auto: "flash-outline",
};

export function StoryCamera({
  onCapture,
  onClose,
}: {
  onCapture: (media: CapturedMedia) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const [facing, setFacing] = useState<Facing>("back");
  const [flash, setFlash] = useState<Flash>("off");
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [locked, setLocked] = useState(false);

  const isRecordingRef = useRef(false);
  const lockedRef = useRef(false);
  const chronoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Anneau de progression d'enregistrement + état visuel du bouton
  const recProgress = useSharedValue(0);
  const rec = useSharedValue(0);
  // Verrouillage : progression du glissement (0→1) + flag côté worklet
  const lockDrag = useSharedValue(0);
  const lockedSV = useSharedValue(false);

  // Demande les permissions au montage
  useEffect(() => {
    if (camPerm && !camPerm.granted) requestCamPerm();
    if (micPerm && !micPerm.granted) requestMicPerm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camPerm?.granted, micPerm?.granted]);

  useEffect(() => {
    return () => {
      if (chronoRef.current) clearInterval(chronoRef.current);
    };
  }, []);

  // ── Photo ────────────────────────────────────────────────────────────────
  const takePhoto = async () => {
    if (!cameraRef.current || isRecordingRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        onCapture({
          uri: photo.uri,
          mimeType: "image/jpeg",
          width: photo.width ?? 0,
          height: photo.height ?? 0,
        });
      }
    } catch {
      // capture annulée / échec silencieux
    }
  };

  // ── Vidéo (maintien) ───────────────────────────────────────────────────────
  // La caméra reste en mode 'video' en permanence (takePictureAsync fonctionne
  // aussi en mode vidéo) → pas de switch de mode, donc pas de course au démarrage
  // de l'enregistrement.
  const beginVideo = () => {
    if (isRecordingRef.current || !cameraReady) return;
    lockedRef.current = false;
    setLocked(false);
    lockedSV.value = false;
    lockDrag.value = 0;
    startRecording();
  };

  // Verrouille l'enregistrement (le relâchement ne l'arrête plus)
  const doLock = () => {
    lockedRef.current = true;
    setLocked(true);
  };

  // Fin du geste : si non verrouillé, on arrête ; sinon on continue
  const handlePanEnd = () => {
    if (!isRecordingRef.current || lockedRef.current) return;
    stopRecording();
  };

  const startRecording = async () => {
    if (!cameraRef.current) return;
    isRecordingRef.current = true;
    setIsRecording(true);
    rec.value = withSpring(1, { damping: 18 });
    recProgress.value = 0;
    recProgress.value = withTiming(1, {
      duration: MAX_VIDEO_SEC * 1000,
      easing: Easing.linear,
    });
    setElapsed(0);
    chronoRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_SEC,
      });
      if (video?.uri) {
        onCapture({ uri: video.uri, mimeType: "video/mp4", width: 0, height: 0 });
      }
    } catch {
      // échec / annulation
    } finally {
      cleanupRecording();
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current || !cameraRef.current) return;
    cameraRef.current.stopRecording(); // résout la promesse recordAsync
  };

  const cleanupRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    lockedRef.current = false;
    setLocked(false);
    lockedSV.value = false;
    lockDrag.value = withTiming(0, { duration: 150 });
    rec.value = withSpring(0, { damping: 18 });
    recProgress.value = withTiming(0, { duration: 150 });
    if (chronoRef.current) clearInterval(chronoRef.current);
    setElapsed(0);
  };

  const cycleFlash = () =>
    setFlash((f) => (f === "off" ? "on" : f === "on" ? "auto" : "off"));
  const flipCamera = () =>
    setFacing((f) => (f === "back" ? "front" : "back"));

  // Geste : tap = photo, maintien = vidéo (priorité au maintien).
  // Le geste est créé UNE SEULE FOIS (useMemo) et appelle les handlers via une
  // ref — sinon le re-render du chrono recrée le geste et annule l'enregistrement
  // en cours (la vidéo se couperait au bout d'1 s).
  const handlersRef = useRef({ takePhoto, beginVideo, doLock, handlePanEnd });
  handlersRef.current.takePhoto = takePhoto;
  handlersRef.current.beginVideo = beginVideo;
  handlersRef.current.doLock = doLock;
  handlersRef.current.handlePanEnd = handlePanEnd;

  const callTakePhoto = useCallback(() => handlersRef.current.takePhoto(), []);
  const callBegin = useCallback(() => handlersRef.current.beginVideo(), []);
  const callLock = useCallback(() => handlersRef.current.doLock(), []);
  const callPanEnd = useCallback(() => handlersRef.current.handlePanEnd(), []);

  // Tap = photo ; appui long = vidéo (Pan activé après 250 ms → suit le doigt sans
  // s'annuler au mouvement) ; glisser vers le haut = verrouiller l'enregistrement.
  const capture = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => runOnJS(callTakePhoto)());
    const pan = Gesture.Pan()
      .activateAfterLongPress(250)
      .onStart(() => runOnJS(callBegin)())
      .onUpdate((e) => {
        const p = Math.min(1, Math.max(0, -e.translationY / LOCK_THRESHOLD));
        lockDrag.value = p;
        if (p >= 1 && !lockedSV.value) {
          lockedSV.value = true;
          runOnJS(callLock)();
        }
      })
      .onFinalize(() => {
        lockDrag.value = withTiming(0, { duration: 150 });
        runOnJS(callPanEnd)();
      });
    return Gesture.Exclusive(pan, tap);
  }, [callTakePhoto, callBegin, callLock, callPanEnd, lockDrag, lockedSV]);

  // ── Styles animés ──────────────────────────────────────────────────────────
  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${recProgress.value * 100}%`,
  }));
  const innerStyle = useAnimatedStyle(() => ({
    borderRadius: 28 - rec.value * 20, // cercle → carré arrondi
    width: 56 - rec.value * 24,
    height: 56 - rec.value * 24,
    backgroundColor: rec.value > 0.5 ? "#EF4444" : "#FFFFFF",
  }));
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: rec.value > 0.5 ? "#EF4444" : "rgba(255,255,255,0.9)",
    transform: [{ scale: 1 + rec.value * 0.12 }],
  }));
  const lockHintStyle = useAnimatedStyle(() => ({
    opacity: rec.value,
    transform: [
      { translateY: -lockDrag.value * 10 },
      { scale: 1 + lockDrag.value * 0.15 },
    ],
  }));
  const lockIconStyle = useAnimatedStyle(() => ({
    backgroundColor: lockDrag.value >= 1 ? "#EF4444" : "rgba(0,0,0,0.55)",
  }));

  const fmt = (s: number) =>
    `0:${String(s).padStart(2, "0")}`;

  // ── Permissions ──────────────────────────────────────────────────────────
  if (!camPerm) {
    return <View style={{ flex: 1, backgroundColor: "black" }} />;
  }

  if (!camPerm.granted) {
    return (
      <View
        style={{ flex: 1, backgroundColor: "black" }}
        className="items-center justify-center px-8 gap-4"
      >
        <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.6)" />
        <Text className="text-white text-center text-base">
          Autorise l&apos;accès à la caméra pour prendre des photos et vidéos.
        </Text>
        <TouchableOpacity
          className="bg-nexa px-6 py-3 rounded-full"
          onPress={() =>
            camPerm.canAskAgain ? requestCamPerm() : Linking.openSettings()
          }
        >
          <Text className="text-white font-semibold">
            {camPerm.canAskAgain ? "Autoriser" : "Ouvrir les réglages"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} className="mt-2">
          <Text className="text-white/60">Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar hidden />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        mode="video"
        enableTorch={isRecording && flash === "on"}
        onCameraReady={() => setCameraReady(true)}
      />

      {/* Barre de progression d'enregistrement */}
      {isRecording && (
        <View
          className="absolute left-0 right-0 h-1 bg-white/20"
          style={{ top: insets.top }}
        >
          <Reanimated.View
            className="h-full bg-red-500"
            style={progressBarStyle}
          />
        </View>
      )}

      {/* Barre haute : fermer + flash + chrono */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-5"
        style={{ top: insets.top + 12 }}
      >
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={32} color="white" />
        </TouchableOpacity>

        {isRecording ? (
          <View className="flex-row items-center gap-1.5 bg-black/40 px-3 py-1 rounded-full">
            <View className="w-2 h-2 rounded-full bg-red-500" />
            <Text className="text-white text-sm font-medium">{fmt(elapsed)}</Text>
          </View>
        ) : (
          <View style={{ width: 32 }} />
        )}

        <TouchableOpacity onPress={cycleFlash} hitSlop={10}>
          <Ionicons name={flashIcon[flash]} size={26} color="white" />
        </TouchableOpacity>
      </View>

      {/* Barre basse : bouton capture + switch caméra */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-center"
        style={{ bottom: insets.bottom + 28 }}
      >
        {/* Indice de verrouillage (glisser vers le haut) */}
        {isRecording && !locked && (
          <Reanimated.View
            pointerEvents="none"
            style={[
              { position: "absolute", bottom: 96, alignItems: "center" },
              lockHintStyle,
            ]}
          >
            <Reanimated.View
              style={[
                {
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                },
                lockIconStyle,
              ]}
            >
              <Ionicons name="lock-closed" size={20} color="white" />
            </Reanimated.View>
            <Ionicons
              name="chevron-up"
              size={18}
              color="rgba(255,255,255,0.7)"
              style={{ marginTop: 2 }}
            />
          </Reanimated.View>
        )}

        {locked ? (
          <TouchableOpacity
            onPress={stopRecording}
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              borderWidth: 4,
              borderColor: "#EF4444",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: "#EF4444",
              }}
            />
          </TouchableOpacity>
        ) : (
          <GestureDetector gesture={capture}>
            <Reanimated.View
              style={[
                {
                  width: 78,
                  height: 78,
                  borderRadius: 39,
                  borderWidth: 4,
                  alignItems: "center",
                  justifyContent: "center",
                },
                ringStyle,
              ]}
            >
              <Reanimated.View style={innerStyle} />
            </Reanimated.View>
          </GestureDetector>
        )}

        {!isRecording && (
          <TouchableOpacity
            onPress={flipCamera}
            className="absolute w-12 h-12 rounded-full bg-white/15 items-center justify-center"
            style={{ right: 36 }}
            hitSlop={8}
          >
            <Ionicons name="camera-reverse-outline" size={26} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Indice d'usage */}
      <View
        className="absolute left-0 right-0 items-center"
        style={{ bottom: insets.bottom + 116 }}
      >
        <Text className="text-white/60 text-xs">
          {locked
            ? "Verrouillé · Appuyez sur le bouton pour arrêter"
            : isRecording
              ? "Glissez vers le haut pour verrouiller"
              : "Appuyez pour une photo · Maintenez pour une vidéo"}
        </Text>
      </View>
    </View>
  );
}
