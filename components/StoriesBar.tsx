import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../lib/api';
import { getUserId } from '../lib/storage';

type StoryUser = { id: string; name: string; photoUrl: string | null };
type Story = { id: string; mediaUrl: string; expiresAt: string };
type StoryGroup = { user: StoryUser; stories: Story[]; hasUnviewed: boolean };

export default function StoriesBar({ onRefresh }: { onRefresh?: () => void }) {
  const router = useRouter();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStories = useCallback(async () => {
    try {
      const [all, mine, uid] = await Promise.all([
        apiRequest<StoryGroup[]>('/stories'),
        apiRequest<Story[]>('/stories/me'),
        getUserId(),
      ]);
      setGroups(all.filter((g) => g.user.id !== uid));
      setMyStories(mine);
      setCurrentUserId(uid);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchStories(); }, []));

  if (loading) return (
    <View className="h-20 items-center justify-center">
      <ActivityIndicator size="small" color="#1E40AF" />
    </View>
  );

  const hasMyStory = myStories.length > 0;

  const myStoryItem = (
    <View className="items-center mr-4">
      <View className="w-14 h-14">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (hasMyStory) {
              router.push({ pathname: '/story/[id]' as any, params: { id: myStories[0].id, userId: currentUserId } });
            } else {
              router.push('/story/create' as any);
            }
          }}
        >
          <View className="w-14 h-14 rounded-full bg-gray-100 items-center justify-center border-2 border-dashed border-gray-300">
            {hasMyStory ? (
              <View className="w-full h-full rounded-full border-2 border-blue-800 overflow-hidden">
                <Image source={{ uri: myStories[0].mediaUrl }} className="w-full h-full" />
              </View>
            ) : (
              <Ionicons name="add" size={24} color="#9CA3AF" />
            )}
          </View>
        </TouchableOpacity>

        {/* Bouton + pour ajouter une story supplémentaire (quand on en a déjà une) */}
        {hasMyStory && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/story/create' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="absolute w-6 h-6 rounded-full bg-blue-800 items-center justify-center border-2 border-white"
            style={{ bottom: -2, right: -2 }}
          >
            <Ionicons name="add" size={14} color="white" />
          </TouchableOpacity>
        )}
      </View>
      <Text className="text-xs text-gray-500 mt-1 w-14 text-center" numberOfLines={1}>
        {hasMyStory ? 'Ma story' : 'Ajouter'}
      </Text>
    </View>
  );

  return (
    <View className="border-b border-gray-100 py-3">
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        data={groups}
        keyExtractor={(item) => item.user.id}
        ListHeaderComponent={myStoryItem}
        ListEmptyComponent={
          groups.length === 0 ? (
            <View className="items-center justify-center ml-4">
              <Text className="text-gray-400 text-xs">Aucune story pour l'instant</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="items-center mr-4"
            onPress={() =>
              router.push({ pathname: '/story/[id]' as any, params: { id: item.stories[0].id, userId: item.user.id } })
            }
          >
            <View
              className={`w-14 h-14 rounded-full border-2 overflow-hidden ${
                item.hasUnviewed ? 'border-nexa' : 'border-gray-300'
              }`}
            >
              {item.user.photoUrl ? (
                <Image source={{ uri: item.user.photoUrl }} className="w-full h-full" />
              ) : (
                <View className="w-full h-full bg-blue-100 items-center justify-center">
                  <Text className="text-blue-800 font-bold text-lg">
                    {item.user.name[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-gray-700 mt-1 w-14 text-center" numberOfLines={1}>
              {item.user.name}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
