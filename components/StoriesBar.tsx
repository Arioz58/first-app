import { useState, useCallback, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiRequest } from '../lib/api';
import { getUserId } from '../lib/storage';

type StoryUser = { id: string; name: string; photoUrl: string | null };
type Story = { id: string; mediaUrl?: string | null; background?: string | null; expiresAt: string };
type StoryGroup = { user: StoryUser; stories: Story[]; hasUnviewed: boolean };
type MyProfile = { name: string; photoUrl: string | null };

const RING = 64;   // diamètre de l'anneau
const INNER = 54;  // diamètre de l'avatar interne

// Anneau autour d'un avatar : dégradé vert (non vu) ou gris fin (vu)
function StoryRing({ unseen, children }: { unseen: boolean; children: ReactNode }) {
  if (unseen) {
    return (
      <LinearGradient
        colors={['#34D399', '#128C7E', '#075E54']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: RING, height: RING, borderRadius: RING / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: INNER + 5, height: INNER + 5, borderRadius: (INNER + 5) / 2,
            backgroundColor: 'white', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {children}
        </View>
      </LinearGradient>
    );
  }
  return (
    <View
      style={{
        width: RING, height: RING, borderRadius: RING / 2,
        borderWidth: 2, borderColor: '#D1D5DB',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

// Avatar circulaire : photo de profil ou initiale
function Avatar({ photoUrl, name }: { photoUrl?: string | null; name?: string }) {
  return (
    <View
      style={{ width: INNER, height: INNER, borderRadius: INNER / 2, overflow: 'hidden' }}
      className="bg-emerald-50 items-center justify-center"
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text className="text-nexa font-bold text-xl">
          {(name?.[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export type StoriesBarHandle = { refresh: () => void };

const StoriesBar = forwardRef<StoriesBarHandle>((_props, ref) => {
  const router = useRouter();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStories = useCallback(async () => {
    try {
      const [me, all, mine, uid] = await Promise.all([
        apiRequest<{ id: string } & MyProfile>('/users/me'),
        apiRequest<StoryGroup[]>('/stories'),
        apiRequest<Story[]>('/stories/me'),
        getUserId(),
      ]);
      setMyProfile({ name: me.name, photoUrl: me.photoUrl });
      setGroups(all.filter((g) => g.user.id !== uid));
      setMyStories(mine);
      setCurrentUserId(uid);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchStories(); }, []));

  // Permet à l'écran parent (pull-to-refresh) de recharger les stories
  useImperativeHandle(ref, () => ({ refresh: fetchStories }), [fetchStories]);

  if (loading) return (
    <View className="h-20 items-center justify-center">
      <ActivityIndicator size="small" color="#128C7E" />
    </View>
  );

  const hasMyStory = myStories.length > 0;

  const myStoryItem = (
    <View className="items-center mr-4">
      <View style={{ width: RING, height: RING }}>
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
          <StoryRing unseen={false}>
            <Avatar photoUrl={myProfile?.photoUrl} name={myProfile?.name} />
          </StoryRing>
        </TouchableOpacity>

        {/* Badge + toujours présent (créer une story) */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/story/create' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="absolute w-6 h-6 rounded-full bg-nexa items-center justify-center border-2 border-white"
          style={{ bottom: 0, right: 0 }}
        >
          <Ionicons name="add" size={14} color="white" />
        </TouchableOpacity>
      </View>
      <Text className="text-xs text-gray-600 mt-1 text-center" style={{ width: RING }} numberOfLines={1}>
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
              <Text className="text-gray-400 text-xs">Aucune story pour l&apos;instant</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="items-center mr-4"
            activeOpacity={0.8}
            onPress={() =>
              router.push({ pathname: '/story/[id]' as any, params: { id: item.stories[0].id, userId: item.user.id } })
            }
          >
            <StoryRing unseen={item.hasUnviewed}>
              <Avatar photoUrl={item.user.photoUrl} name={item.user.name} />
            </StoryRing>
            <Text className="text-xs text-gray-700 mt-1 text-center" style={{ width: RING }} numberOfLines={1}>
              {item.user.name}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
});

StoriesBar.displayName = 'StoriesBar';

export default StoriesBar;
