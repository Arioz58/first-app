import { useEffect, useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  Dimensions, Animated, StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { getUserId } from '../../lib/storage';

const { width } = Dimensions.get('window');
const STORY_DURATION = 5000;

type Story = { id: string; mediaUrl: string; expiresAt: string };
type StoryGroup = { user: { id: string; name: string; photoUrl: string | null }; stories: Story[] };

export default function StoryViewScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const uid = await getUserId();
      setCurrentUserId(uid);

      if (uid === userId) {
        const mine = await apiRequest<Story[]>('/stories/me');
        setStories(mine);
        setUserName('Ma story');
      } else {
        const all = await apiRequest<StoryGroup[]>('/stories');
        const group = all.find((g) => g.user.id === userId);
        if (group) {
          setStories(group.stories);
          setUserName(group.user.name);
        }
      }
    };
    init();
  }, [userId]);

  useEffect(() => {
    if (!stories.length) return;
    startProgress();
    return () => {
      progress.stopAnimation();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stories, currentIndex]);

  const startProgress = () => {
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

  const goNext = () => {
    if (timer.current) clearTimeout(timer.current);
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      router.back();
    }
  };

  const goPrev = () => {
    if (timer.current) clearTimeout(timer.current);
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const handleDelete = async () => {
    const story = stories[currentIndex];
    await apiRequest(`/stories/${story.id}`, { method: 'DELETE' });
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
    <View className="flex-1 bg-black">
      <StatusBar hidden />

      {/* Barres de progression */}
      <SafeAreaView className="absolute top-0 left-0 right-0 z-10 px-2 pt-2">
        <View className="flex-row gap-1 mb-3">
          {stories.map((_, i) => (
            <View key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              {i === currentIndex && (
                <Animated.View
                  className="h-full bg-white rounded-full"
                  style={{ width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
                />
              )}
              {i < currentIndex && <View className="h-full w-full bg-white rounded-full" />}
            </View>
          ))}
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-2">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center">
              <Text className="text-white font-bold text-sm">{userName[0]?.toUpperCase()}</Text>
            </View>
            <Text className="text-white font-semibold">{userName}</Text>
          </View>
          <View className="flex-row gap-3 items-center">
            {isOwner && (
              <TouchableOpacity onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color="white" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={26} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Image */}
      <Image
        source={{ uri: current.mediaUrl }}
        className="flex-1"
        resizeMode="contain"
      />

      {/* Zones de tap gauche/droite */}
      <View className="absolute inset-0 flex-row">
        <TouchableOpacity className="flex-1" onPress={goPrev} activeOpacity={1} />
        <TouchableOpacity className="flex-1" onPress={goNext} activeOpacity={1} />
      </View>
    </View>
  );
}
