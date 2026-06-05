import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "../../lib/api";
import { getUserId } from "../../lib/storage";
import {
  getTextFontStyle,
  getTextRenderStyle,
  TEXT_TYPOGRAPHY,
  type BgMode,
} from "../../lib/storyText";

const { width } = Dimensions.get("window");
const STORY_DURATION = 5000;

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
};
type Story = {
  id: string;
  mediaUrl: string;
  expiresAt: string;
  createdAt: string;
  texts?: StoryText[] | null;
};
type StoryGroup = {
  user: { id: string; name: string; photoUrl: string | null };
  stories: Story[];
};

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
  // ids des stories dont l'image a déjà été chargée (et donc en cache) →
  // évite d'afficher le texte avant l'image, mais réaffiche instantanément
  // une story déjà vue (retour en arrière).
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());

  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(STORY_DURATION); // temps restant après une pause
  const pausedRef = useRef(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);

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
      Image.prefetch(s.mediaUrl).catch(() => {});
    });
  }, [stories]);

  useEffect(() => {
    if (!stories.length || isZoomed) return;
    const currentStory = stories[currentIndex];
    if (!currentStory) return;
    // Tant que l'image de la story n'a jamais été chargée, on garde la barre
    // vide et on ne démarre pas le timer. Une story déjà vue (en cache) démarre
    // aussitôt, sans attente.
    if (!loadedIds.has(currentStory.id)) {
      progress.setValue(0);
      return;
    }
    startProgress();
    return () => {
      progress.stopAnimation();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stories, currentIndex, isZoomed, loadedIds]);

  const startProgress = () => {
    pausedRef.current = false;
    remaining.current = STORY_DURATION;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        router.back();
      }
    }, STORY_DURATION);
  };

  // Maintien appuyé → gèle la progression à sa valeur courante
  const pauseStory = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    if (timer.current) clearTimeout(timer.current);
    progress.stopAnimation((value: number) => {
      remaining.current = Math.max(0, STORY_DURATION * (1 - value));
    });
  };

  // Relâché → reprend sur le temps restant
  const resumeStory = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
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

  const goNext = () => {
    if (isZoomed) return;
    if (timer.current) clearTimeout(timer.current);
    if (currentIndex < stories.length - 1) setCurrentIndex((i) => i + 1);
    else router.back();
  };

  const goPrev = () => {
    if (isZoomed) return;
    if (timer.current) clearTimeout(timer.current);
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
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

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar hidden />

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
            {isOwner && (
              <TouchableOpacity onPress={handleDelete}>
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
          <Image
            source={{ uri: current.mediaUrl }}
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
          {loadedIds.has(current.id) && current.texts && current.texts.length > 0 && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {current.texts.map((t, i) => {
                  const ts = getTextRenderStyle(t.color, t.bgMode);
                  return (
                    <View
                      key={i}
                      style={[
                        ts.bubble,
                        {
                          position: "absolute",
                          transform: [
                            { translateX: (t.normX - 0.5) * width },
                            {
                              translateY:
                                (t.normY - 0.5) *
                                Dimensions.get("window").height,
                            },
                            { scale: t.scale ?? 1 },
                            {
                              rotate:
                                t.rotation != null
                                  ? `${t.rotation}rad`
                                  : "0rad",
                            },
                          ],
                        },
                      ]}
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
    </View>
  );
}
