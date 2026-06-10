import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  FadeInDown,
  FadeOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoryBackground } from "../../components/StoryBackground";
import { apiRequest } from "../../lib/api";
import { connectSocket } from "../../lib/socket";
import { STICKER_FONT_SIZE } from "../../lib/storyStickers";
import { getUserId } from "../../lib/storage";
import {
  getTextFontStyle,
  getTextRenderStyle,
  TEXT_TYPOGRAPHY,
  type BgMode,
} from "../../lib/storyText";

const { width } = Dimensions.get("window");
const STORY_DURATION = 5000;
// Réactions rapides au-dessus du champ de réponse (style Instagram)
const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "👏", "🔥"];
// Ressort du drawer « Vu par » : rapide et sans rebond (overshootClamping)
const SHEET_SPRING = {
  damping: 24,
  stiffness: 220,
  mass: 0.7,
  overshootClamping: true,
};

type StoryText = {
  content: string;
  normX: number;
  normY: number;
  scale?: number;
  rotation?: number;
  color?: string;
  bgMode?: BgMode;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  kind?: "text" | "sticker";
};
type Story = {
  id: string;
  mediaUrl?: string | null;
  background?: string | null;
  expiresAt: string;
  createdAt: string;
  texts?: StoryText[] | null;
  viewCount?: number;
};
type ViewerRow = {
  id: string;
  createdAt: string;
  viewer: { id: string; name: string; photoUrl: string | null };
};
type StoryGroup = {
  user: { id: string; name: string; photoUrl: string | null };
  stories: Story[];
};

// Détecte une story vidéo via l'extension de l'URL (le backend la garantit).
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

// Ordonne les stories du plus ancien au plus récent (visionnage chronologique).
function oldestFirst(arr: Story[]): Story[] {
  return [...arr].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

// Temps écoulé depuis la publication : minutes si < 1h, sinon heures.
function formatStoryTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

export default function StoryViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);
  // Drawer « Vu par » (propriétaire) : barre repliée + détail au drag/tap
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  // Réponse à une story (non-propriétaire)
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // ids des stories dont la vue a déjà été enregistrée (1 POST par story max)
  const viewedSentRef = useRef<Set<string>>(new Set());
  // ids des stories dont l'image a déjà été chargée (et donc en cache) →
  // évite d'afficher le texte avant l'image, mais réaffiche instantanément
  // une story déjà vue (retour en arrière).
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());

  // Vidéo
  const [muted, setMuted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoReadyRef = useRef(false);
  const mutedRef = useRef(false);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(STORY_DURATION); // temps restant après une pause
  const durationRef = useRef(STORY_DURATION); // durée de la story courante (ms)
  const pausedRef = useRef(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);

  // Drawer « Vu par » : 0 = replié, 1 = ouvert
  const sheetProgress = useSharedValue(0);
  const savedSheet = useSharedValue(0);

  // Swipe-down pour fermer le viewer
  const swipeY = useSharedValue(0);

  const updateZoomed = (zoomed: boolean) => setIsZoomed(zoomed);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        runOnJS(updateZoomed)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(updateZoomed)(true);
      }
    });

  const rotationGesture = Gesture.Rotation()
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(1);
      savedScale.value = 1;
      rotation.value = withSpring(0);
      savedRotation.value = 0;
      runOnJS(updateZoomed)(false);
    });

  const composed = Gesture.Simultaneous(
    pinchGesture,
    rotationGesture,
    doubleTapGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}rad` }],
  }));

  // Hauteurs du drawer (barre repliée visible vs panneau ouvert)
  const COLLAPSED_VISIBLE = 60 + insets.bottom;
  const OPEN_HEIGHT = Dimensions.get("window").height * 0.55;
  const SHEET_RANGE = OPEN_HEIGHT - COLLAPSED_VISIBLE;

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetProgress.value) * SHEET_RANGE }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetProgress.value * 0.55,
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sheetProgress.value * 180}deg` }],
  }));
  const swipeStyle = useAnimatedStyle(() => {
    const s = 1 - Math.min(swipeY.value / 1400, 0.16);
    return {
      transform: [{ translateY: swipeY.value }, { scale: s }],
      borderRadius: swipeY.value > 1 ? 22 : 0,
      overflow: "hidden",
    };
  });

  useEffect(() => {
    const init = async () => {
      const uid = await getUserId();
      setCurrentUserId(uid);
      if (uid === userId) {
        const mine = await apiRequest<Story[]>("/stories/me");
        setStories(oldestFirst(mine));
        setUserName("Ma story");
      } else {
        const all = await apiRequest<StoryGroup[]>("/stories");
        const group = all.find((g) => g.user.id === userId);
        if (group) {
          setStories(oldestFirst(group.stories));
          setUserName(group.user.name);
        }
      }
    };
    init();
  }, [userId]);

  // Précharge toutes les images en cache pour accélérer la navigation.
  useEffect(() => {
    stories.forEach((s) => {
      if (s.mediaUrl && !isVideoUrl(s.mediaUrl))
        Image.prefetch(s.mediaUrl).catch(() => {});
    });
  }, [stories]);

  // (Re)charge la source vidéo quand la story courante change.
  useEffect(() => {
    const cur = stories[currentIndex];
    if (!cur) return;
    if (cur.mediaUrl && isVideoUrl(cur.mediaUrl)) {
      videoReadyRef.current = false;
      setVideoReady(false);
      player.muted = mutedRef.current;
      // replaceAsync : charge la vidéo hors du thread principal (pas de gel UI)
      player.replaceAsync({ uri: cur.mediaUrl }).catch(() => {});
    } else {
      videoReadyRef.current = false;
      setVideoReady(false);
      player.pause();
    }
  }, [stories, currentIndex, player]);

  // Démarre la lecture quand la vidéo est prête et fixe la durée de la story.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay" && !videoReadyRef.current) {
        videoReadyRef.current = true;
        durationRef.current = Math.max(1000, (player.duration || 5) * 1000);
        setVideoReady(true);
        player.play();
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (!stories.length || isZoomed) return;
    const currentStory = stories[currentIndex];
    if (!currentStory) return;
    const hasMedia = !!currentStory.mediaUrl;
    const isVid = isVideoUrl(currentStory.mediaUrl ?? "");
    // On attend que le média soit prêt (image chargée / vidéo bufferisée) avant
    // de démarrer la barre et le timer. Un fond coloré est prêt immédiatement.
    const ready = !hasMedia
      ? true
      : isVid
        ? videoReady
        : loadedIds.has(currentStory.id);
    if (!ready) {
      progress.setValue(0);
      return;
    }
    if (!isVid) durationRef.current = STORY_DURATION;
    startProgress();
    return () => {
      progress.stopAnimation();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stories, currentIndex, isZoomed, loadedIds, videoReady]);

  // Enregistre la vue dès que le média de la story courante est affiché
  // (une seule fois par story, et jamais sur ses propres stories).
  useEffect(() => {
    const cur = stories[currentIndex];
    if (!cur || !currentUserId || currentUserId === userId) return;
    const ready = !cur.mediaUrl
      ? true
      : isVideoUrl(cur.mediaUrl)
        ? videoReady
        : loadedIds.has(cur.id);
    if (!ready || viewedSentRef.current.has(cur.id)) return;
    viewedSentRef.current.add(cur.id);
    apiRequest(`/stories/${cur.id}/view`, { method: "POST" }).catch(() => {
      viewedSentRef.current.delete(cur.id); // réessai possible si échec
    });
  }, [stories, currentIndex, currentUserId, userId, videoReady, loadedIds]);

  // Pré-charge les viewers de la story courante (propriétaire) → alimente les
  // avatars empilés et rend le détail disponible instantanément.
  useEffect(() => {
    const owner = !!currentUserId && currentUserId === userId;
    const cur = stories[currentIndex];
    if (!owner || !cur) return;
    let active = true;
    setViewers([]);
    apiRequest<ViewerRow[]>(`/stories/${cur.id}/views`)
      .then((rows) => active && setViewers(rows))
      .catch(() => active && setViewers([]));
    return () => {
      active = false;
    };
  }, [currentUserId, userId, stories, currentIndex]);

  const startProgress = () => {
    pausedRef.current = false;
    remaining.current = durationRef.current;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: durationRef.current,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        router.back();
      }
    }, durationRef.current);
  };

  // Maintien appuyé → gèle la progression à sa valeur courante
  const pauseStory = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    if (timer.current) clearTimeout(timer.current);
    progress.stopAnimation((value: number) => {
      remaining.current = Math.max(0, durationRef.current * (1 - value));
    });
    if (isVideoUrl(stories[currentIndex]?.mediaUrl ?? "")) player.pause();
  };

  // Relâché → reprend sur le temps restant
  const resumeStory = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    if (isVideoUrl(stories[currentIndex]?.mediaUrl ?? "")) player.play();
    Animated.timing(progress, {
      toValue: 1,
      duration: remaining.current,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        router.back();
      }
    }, remaining.current);
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      player.muted = next;
      return next;
    });
  };

  const goNext = () => {
    if (isZoomed) return;
    if (keyboardVisible) return Keyboard.dismiss();
    if (showReactions) return closeReactions();
    if (timer.current) clearTimeout(timer.current);
    if (currentIndex < stories.length - 1) setCurrentIndex((i) => i + 1);
    else router.back();
  };

  const goPrev = () => {
    if (isZoomed) return;
    if (keyboardVisible) return Keyboard.dismiss();
    if (showReactions) return closeReactions();
    if (timer.current) clearTimeout(timer.current);
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const openSheet = () => {
    pauseStory();
    setSheetOpen(true);
    savedSheet.value = 1;
    sheetProgress.value = withSpring(1, SHEET_SPRING);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    savedSheet.value = 0;
    sheetProgress.value = withSpring(0, SHEET_SPRING);
    resumeStory();
  };

  // Drag interactif : le drawer suit le doigt, aimantation ouvert/fermé au relâcher
  const sheetPan = Gesture.Pan()
    .onStart(() => {
      runOnJS(pauseStory)();
    })
    .onUpdate((e) => {
      const next = savedSheet.value - e.translationY / SHEET_RANGE;
      sheetProgress.value = Math.min(1, Math.max(0, next));
    })
    .onEnd((e) => {
      const open =
        e.velocityY < -300
          ? true
          : e.velocityY > 300
            ? false
            : sheetProgress.value > 0.5;
      sheetProgress.value = withSpring(open ? 1 : 0, SHEET_SPRING);
      savedSheet.value = open ? 1 : 0;
      runOnJS(setSheetOpen)(open);
      if (!open) runOnJS(resumeStory)();
    });

  const sheetTap = Gesture.Tap().onEnd(() => {
    runOnJS(openSheet)();
  });

  const sheetGesture = Gesture.Exclusive(sheetPan, sheetTap);

  // Répond à la story courante → message dans la conversation directe avec l'auteur
  const sendReply = async (raw: string) => {
    const content = raw.trim();
    const story = stories[currentIndex];
    if (!content || sending || !story) return;
    setSending(true);
    try {
      const conv = await apiRequest<{ id: string }>("/conversations/direct", {
        method: "POST",
        body: { targetUserId: userId },
      });
      const socket = await connectSocket();
      socket.emit("send_message", {
        conversationId: conv.id,
        content,
        type: "story_reply",
        storyId: story.id,
        storyMediaUrl: story.mediaUrl,
      });
      setReplyText("");
      Keyboard.dismiss();
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 1500);
    } catch {
      // échec silencieux (réseau) — l'utilisateur peut réessayer
    } finally {
      setSending(false);
    }
  };

  // Popover de réactions : pause la story tant qu'il est ouvert
  const openReactions = () => {
    pauseStory();
    setShowReactions(true);
  };
  const closeReactions = () => {
    setShowReactions(false);
    resumeStory();
  };
  const toggleReactions = () => {
    if (showReactions) closeReactions();
    else openReactions();
  };

  // Le clavier est la source de vérité : pause tant qu'il est ouvert, reprise à sa fermeture
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sub1 = Keyboard.addListener(showEvt, () => {
      setKeyboardVisible(true);
      pauseStory();
    });
    const sub2 = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      resumeStory();
    });
    return () => {
      sub1.remove();
      sub2.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, currentIndex]);

  // Demande confirmation avant suppression (pause la story le temps de l'alerte)
  const confirmDelete = () => {
    pauseStory();
    Alert.alert(
      "Supprimer la story",
      "Cette story sera définitivement supprimée.",
      [
        { text: "Annuler", style: "cancel", onPress: resumeStory },
        { text: "Supprimer", style: "destructive", onPress: handleDelete },
      ],
    );
  };

  const handleDelete = async () => {
    const story = stories[currentIndex];
    await apiRequest(`/stories/${story.id}`, { method: "DELETE" });
    if (stories.length === 1) {
      router.back();
    } else {
      const updated = stories.filter((_, i) => i !== currentIndex);
      setStories(updated);
      setCurrentIndex(Math.min(currentIndex, updated.length - 1));
    }
  };

  if (!stories.length) return null;

  const current = stories[currentIndex];
  const isOwner = currentUserId === userId;
  const viewerCount = viewers.length || current.viewCount || 0;
  const hasMedia = !!current.mediaUrl;
  const currentIsVideo = isVideoUrl(current.mediaUrl ?? "");
  const mediaReady = !hasMedia
    ? true
    : currentIsVideo
      ? videoReady
      : loadedIds.has(current.id);

  // Glisser vers le bas pour fermer (désactivé si zoom / drawer / clavier ouverts)
  const closeViewer = () => router.back();
  const swipeDown = Gesture.Pan()
    .enabled(!isZoomed && !sheetOpen && !keyboardVisible)
    .maxPointers(1)
    .activeOffsetY(16)
    .failOffsetX([-24, 24])
    .onStart(() => runOnJS(pauseStory)())
    .onUpdate((e) => {
      swipeY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (swipeY.value > 130 || e.velocityY > 900) {
        runOnJS(closeViewer)();
      } else {
        swipeY.value = withSpring(0);
        runOnJS(resumeStory)();
      }
    });

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar hidden />

      <GestureDetector gesture={swipeDown}>
        <Reanimated.View style={[{ flex: 1 }, swipeStyle]}>

      <View
        className="absolute top-0 left-0 right-0 z-10 px-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row gap-1 mb-3">
          {stories.map((_, i) => (
            <View
              key={i}
              className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
            >
              {i === currentIndex && (
                <Animated.View
                  className="h-full bg-white rounded-full"
                  style={{
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  }}
                />
              )}
              {i < currentIndex && (
                <View className="h-full w-full bg-white rounded-full" />
              )}
            </View>
          ))}
        </View>

        <View className="flex-row items-center justify-between px-2">
          <View className="flex-row items-center gap-2">
            <View className="w-12 h-12 rounded-full bg-white/20 items-center border border-1 border-black/20 justify-center">
              <Text className="text-white font-bold text-sm">
                {userName[0]?.toUpperCase()}
              </Text>
            </View>
            <Text className="text-white text-md font-semibold">{userName}</Text>
            <Text className="text-white/80 text-sm">
              {formatStoryTime(current.createdAt)}
            </Text>
          </View>
          <View className="flex-row gap-3 items-center">
            {currentIsVideo && (
              <TouchableOpacity onPress={toggleMute}>
                <Ionicons
                  name={muted ? "volume-mute" : "volume-high"}
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={26} color="white" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={36} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <GestureDetector gesture={composed}>
        <Reanimated.View style={[{ flex: 1 }, animatedStyle]}>
          {!hasMedia ? (
            <StoryBackground
              id={current.background}
              style={{ flex: 1 }}
            />
          ) : currentIsVideo ? (
            <VideoView
              player={player}
              style={{ flex: 1 }}
              contentFit="contain"
              nativeControls={false}
            />
          ) : (
            <Image
              source={{ uri: current.mediaUrl ?? undefined }}
              style={{ flex: 1 }}
              resizeMode="contain"
              onLoadEnd={() =>
                setLoadedIds((prev) => {
                  if (prev.has(current.id)) return prev;
                  const next = new Set(prev);
                  next.add(current.id);
                  return next;
                })
              }
            />
          )}
          {mediaReady && current.texts && current.texts.length > 0 && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {current.texts.map((t, i) => {
                  const transform = [
                    { translateX: (t.normX - 0.5) * width },
                    {
                      translateY:
                        (t.normY - 0.5) * Dimensions.get("window").height,
                    },
                    { scale: t.scale ?? 1 },
                    {
                      rotate: t.rotation != null ? `${t.rotation}rad` : "0rad",
                    },
                  ];
                  // Sticker emoji : pas de bulle, taille de base partagée
                  if (t.kind === "sticker") {
                    return (
                      <View key={i} style={{ position: "absolute", transform }}>
                        <Text style={{ fontSize: STICKER_FONT_SIZE }}>
                          {t.content}
                        </Text>
                      </View>
                    );
                  }
                  const ts = getTextRenderStyle(t.color, t.bgMode);
                  return (
                    <View
                      key={i}
                      style={[ts.bubble, { position: "absolute", transform }]}
                    >
                      <Text
                        style={[
                          TEXT_TYPOGRAPHY,
                          getTextFontStyle(t.bold, t.italic, t.underline),
                          ts.text,
                        ]}
                      >
                        {t.content}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </Reanimated.View>
      </GestureDetector>

      {!isZoomed && (
        <View className="absolute inset-0 flex-row">
          <TouchableOpacity
            className="flex-1"
            onPress={goPrev}
            onLongPress={pauseStory}
            onPressOut={resumeStory}
            delayLongPress={200}
            activeOpacity={1}
          />
          <TouchableOpacity
            className="flex-1"
            onPress={goNext}
            onLongPress={pauseStory}
            onPressOut={resumeStory}
            delayLongPress={200}
            activeOpacity={1}
          />
        </View>
      )}

      {isZoomed && (
        <View className="absolute bottom-12 left-0 right-0 items-center">
          <View className="bg-black/50 px-4 py-2 rounded-full">
            <Text className="text-white/70 text-xs">
              Double tap pour réinitialiser
            </Text>
          </View>
        </View>
      )}

      {isOwner && !isZoomed && (
        <>
          {/* Fond assombrissant cliquable (actif uniquement drawer ouvert) */}
          <Reanimated.View
            pointerEvents={sheetOpen ? "auto" : "none"}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "black" },
              backdropStyle,
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={closeSheet}
            />
          </Reanimated.View>

          {/* Drawer sombre : barre repliée (poignée + avatars + compteur) + liste */}
          <Reanimated.View
            style={[
              {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: OPEN_HEIGHT,
                backgroundColor: "#171717",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
              },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={sheetGesture}>
              <View style={{ paddingTop: 8 }}>
                <View className="items-center pb-2">
                  <View className="w-10 h-1 rounded-full bg-white/30" />
                </View>
                <View
                  className="flex-row items-center justify-between px-5"
                  style={{ height: COLLAPSED_VISIBLE - 28 }}
                >
                  <View className="flex-row items-center">
                    {viewers.slice(0, 3).map((v, i) => (
                      <View
                        key={v.id}
                        style={{ marginLeft: i === 0 ? 0 : -10 }}
                        className="w-8 h-8 rounded-full overflow-hidden border-2 border-neutral-900 bg-blue-200 items-center justify-center"
                      >
                        {v.viewer.photoUrl ? (
                          <Image
                            source={{ uri: v.viewer.photoUrl }}
                            className="w-full h-full"
                          />
                        ) : (
                          <Text className="text-blue-900 text-xs font-bold">
                            {v.viewer.name[0]?.toUpperCase()}
                          </Text>
                        )}
                      </View>
                    ))}
                    <View className="flex-row items-center gap-1.5 ml-2">
                      <Ionicons name="eye-outline" size={18} color="white" />
                      <Text className="text-white text-sm font-semibold">
                        {viewerCount} {viewerCount > 1 ? "vues" : "vue"}
                      </Text>
                    </View>
                  </View>
                  <Reanimated.View style={chevronStyle}>
                    <Ionicons
                      name="chevron-up"
                      size={22}
                      color="rgba(255,255,255,0.6)"
                    />
                  </Reanimated.View>
                </View>
              </View>
            </GestureDetector>

            {viewers.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <Text className="text-white/40 text-sm">
                  {"Personne n'a encore vu cette story"}
                </Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{
                  paddingTop: 4,
                  paddingBottom: insets.bottom + 16,
                }}
                renderItem={({ item }) => (
                  <View className="flex-row items-center gap-3 px-5 py-2.5">
                    <View className="w-11 h-11 rounded-full overflow-hidden bg-blue-200 items-center justify-center">
                      {item.viewer.photoUrl ? (
                        <Image
                          source={{ uri: item.viewer.photoUrl }}
                          className="w-full h-full"
                        />
                      ) : (
                        <Text className="text-blue-900 font-bold">
                          {item.viewer.name[0]?.toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text className="flex-1 text-white text-sm font-medium">
                      {item.viewer.name}
                    </Text>
                    <Text className="text-white/40 text-xs">
                      {formatStoryTime(item.createdAt)}
                    </Text>
                  </View>
                )}
              />
            )}
          </Reanimated.View>
        </>
      )}

      {!isOwner && !isZoomed && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <View className="px-3 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
            {sentFlash && (
              <View className="items-center mb-2">
                <View className="flex-row items-center gap-1 bg-white/15 px-4 py-1.5 rounded-full">
                  <Ionicons name="checkmark" size={14} color="white" />
                  <Text className="text-white text-xs">Envoyé</Text>
                </View>
              </View>
            )}

            {/* Popover flottant de réactions (ouvert via le smiley) */}
            {showReactions && (
              <Reanimated.View
                entering={FadeInDown.duration(150)}
                exiting={FadeOutDown.duration(120)}
                className="self-end mr-1 mb-2 bg-black/70 rounded-full px-4 py-2"
              >
                <View className="flex-row gap-4">
                  {QUICK_EMOJIS.map((e) => (
                    <TouchableOpacity
                      key={e}
                      onPress={() => {
                        sendReply(e);
                        closeReactions();
                      }}
                      disabled={sending}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Text style={{ fontSize: 28 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Reanimated.View>
            )}

            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center bg-black/60 rounded-full px-4">
                <TextInput
                  className="flex-1 py-2.5 text-white text-base"
                  placeholder="Envoyer un message…"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  value={replyText}
                  onChangeText={setReplyText}
                  onFocus={() => {
                    if (showReactions) setShowReactions(false);
                  }}
                  returnKeyType="send"
                  onSubmitEditing={() => sendReply(replyText)}
                  multiline
                />
                <TouchableOpacity
                  onPress={toggleReactions}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="pl-2"
                >
                  <Ionicons
                    name={showReactions ? "happy" : "happy-outline"}
                    size={24}
                    color="rgba(255,255,255,0.85)"
                  />
                </TouchableOpacity>
              </View>
              {replyText.trim().length > 0 && (
                <Reanimated.View
                  entering={ZoomIn.duration(180)}
                  exiting={ZoomOut.duration(150)}
                >
                  <TouchableOpacity
                    onPress={() => sendReply(replyText)}
                    disabled={sending}
                    className="w-10 h-10 rounded-full bg-nexa items-center justify-center"
                  >
                    <Ionicons name="paper-plane" size={18} color="white" />
                  </TouchableOpacity>
                </Reanimated.View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}
