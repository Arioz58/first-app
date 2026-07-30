import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../../components/BottomSheet';
import FloatingSuggestions from '../../components/FloatingSuggestions';
import StoriesBar, { type StoriesBarHandle } from '../../components/StoriesBar';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { setPendingFriendRequests } from '../../lib/friendRequests';

const NEXA = '#1E40AF';

type Segment = 'activity' | 'community';

type RequestItem = {
  requestId: string;
  createdAt: string;
  user: { id: string; name: string; photoUrl: string | null };
};
type Suggestion = {
  id: string;
  name: string;
  photoUrl: string | null;
  mutualFriendsCount: number;
};

export default function UpdatesScreen() {
  const { t } = useTranslation();
  const [seg, setSeg] = useState<Segment>('activity');
  const storiesRef = useRef<StoriesBarHandle>(null);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900" edges={['top']}>
      <View className="px-4 pt-3 pb-2">
        <Text className="text-3xl font-bold text-nexa">{t('tabs.updates')}</Text>
      </View>

      {/* Stories — toujours en tête, hors du contenu qui défile. */}
      <StoriesBar ref={storiesRef} />

      {/* Segments Activité / Communauté */}
      <View className="flex-row px-4 py-3">
        {(['activity', 'community'] as const).map((s) => {
          const active = seg === s;
          return (
            <TouchableOpacity
              key={s}
              className={`flex-1 items-center py-2 rounded-full mx-1 ${active ? 'bg-nexa' : 'bg-gray-100 dark:bg-zinc-800'}`}
              onPress={() => setSeg(s)}
            >
              <Text className={`text-base font-semibold ${active ? 'text-white' : 'text-gray-600 dark:text-zinc-300'}`}>
                {t(`updates.${s}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {seg === 'activity' ? (
        <ActivityTab onStoriesRefresh={() => storiesRef.current?.refresh()} />
      ) : (
        <CommunityTab />
      )}
    </SafeAreaView>
  );
}

function ActivityTab({ onStoriesRefresh }: { onStoriesRefresh: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [received, setReceived] = useState<RequestItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [me, setMe] = useState<{ name: string; photoUrl: string | null }>({ name: '', photoUrl: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [suggOpen, setSuggOpen] = useState(false); // drawer « voir tout »
  const [focusTick, setFocusTick] = useState(0); // rejoue l'anim des suggestions à l'arrivée sur l'onglet

  const load = useCallback(async () => {
    try {
      const [r, s, profile] = await Promise.all([
        apiRequest<RequestItem[]>('/friends/requests/received'),
        apiRequest<Suggestion[]>('/friends/suggestions'),
        apiRequest<{ name: string; photoUrl: string | null }>('/users/me'),
      ]);
      setReceived(r);
      setSuggestions(s);
      setMe({ name: profile.name, photoUrl: profile.photoUrl });
      setPendingFriendRequests(r.length); // resynchronise le badge de l'onglet Contacts
    } catch {
      // silencieux
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      setFocusTick((x) => x + 1); // relance l'animation d'apparition des suggestions
    }, [load]),
  );

  const act = async (fn: () => Promise<unknown>, key: string) => {
    setActing(key);
    try {
      await fn();
      await load();
    } catch {
      // silencieux
    } finally {
      setActing(null);
    }
  };

  const accept = (id: string) =>
    act(() => apiRequest(`/friends/requests/${id}/accept`, { method: 'POST' }), id);
  const refuse = (id: string) =>
    act(() => apiRequest(`/friends/requests/${id}/refuse`, { method: 'POST' }), id);
  // La suggestion disparaît optimistiquement dès l'envoi de la demande.
  const addFriend = (userId: string) =>
    act(async () => {
      setSuggestions((prev) => prev.filter((s) => s.id !== userId));
      await apiRequest('/friends/requests', { method: 'POST', body: { toUserId: userId } });
    }, userId);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={NEXA} />
      </View>
    );
  }


  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
            onStoriesRefresh();
          }}
        />
      }
    >
      {/* Suggestions — affichage flottant façon iCloud (moi au centre), EN HAUT.
          Toujours affiché (avatar central + message si aucune suggestion). */}
      <FloatingSuggestions
        suggestions={suggestions}
        myPhotoUrl={me.photoUrl}
        myName={me.name}
        replayKey={focusTick}
        onOpenProfile={(uid) => router.push({ pathname: '/user/[id]' as any, params: { id: uid } })}
        onSeeAll={() => setSuggOpen(true)}
      />

      {/* Demandes d'ami reçues — en dessous des suggestions */}
      {received.length > 0 ? (
        <View className="mt-6">
          <Text className="text-sm font-semibold text-gray-400 dark:text-zinc-500 uppercase px-5 pb-2">
            {t('activity.requests')}
          </Text>
          {received.map((r) => (
            <View key={r.requestId} className="flex-row items-center px-4 py-3">
              <TouchableOpacity onPress={() => router.push({ pathname: '/user/[id]' as any, params: { id: r.user.id } })}>
                <UserAvatar photoUrl={r.user.photoUrl} name={r.user.name} size={56} />
              </TouchableOpacity>
              <Text className="flex-1 ml-3 font-semibold text-gray-900 dark:text-zinc-100" numberOfLines={1}>
                {r.user.name}
              </Text>
              <TouchableOpacity
                className="bg-nexa rounded-full px-4 py-2 mr-2"
                disabled={acting === r.requestId}
                onPress={() => accept(r.requestId)}
              >
                <Text className="text-white text-base font-semibold">{t('relation.accept')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-gray-100 dark:bg-zinc-800 rounded-full px-4 py-2"
                disabled={acting === r.requestId}
                onPress={() => refuse(r.requestId)}
              >
                <Text className="text-gray-600 dark:text-zinc-300 text-base font-semibold">{t('relation.refuse')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {/* Drawer « voir tout » : liste complète + Ajouter */}
      <BottomSheet visible={suggOpen} onClose={() => setSuggOpen(false)}>
        <View className="pb-6 pt-1">
          <Text className="text-lg font-bold text-gray-900 dark:text-zinc-100 px-5 pb-2">{t('activity.suggestions')}</Text>
          {suggestions.map((s) => (
            <View key={s.id} className="flex-row items-center px-4 py-3">
              <TouchableOpacity
                onPress={() => {
                  setSuggOpen(false);
                  router.push({ pathname: '/user/[id]' as any, params: { id: s.id } });
                }}
              >
                <UserAvatar photoUrl={s.photoUrl} name={s.name} size={52} />
              </TouchableOpacity>
              <View className="flex-1 ml-3">
                <Text className="font-semibold text-gray-900 dark:text-zinc-100" numberOfLines={1}>{s.name}</Text>
                {s.mutualFriendsCount > 0 ? (
                  <Text className="text-gray-400 dark:text-zinc-500 text-sm">
                    {t(
                      s.mutualFriendsCount === 1 ? 'profile_view.mutual_one' : 'profile_view.mutual_other',
                      { count: s.mutualFriendsCount },
                    )}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                className="flex-row items-center bg-blue-50 dark:bg-blue-950 rounded-full px-4 py-2"
                disabled={acting === s.id}
                onPress={() => addFriend(s.id)}
              >
                <Ionicons name="person-add" size={15} color={NEXA} />
                <Text className="text-nexa text-base font-semibold ml-1.5">{t('relation.add_friend')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </BottomSheet>
    </ScrollView>
  );
}

// Coquille assumée : la gamification (points/classement) et le B2B arrivent au Mois 5.
function CommunityTab() {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 items-center justify-center px-10 mt-16">
        <View className="w-20 h-20 rounded-3xl bg-blue-50 dark:bg-blue-950 items-center justify-center">
          <Ionicons name="trophy" size={36} color={NEXA} />
        </View>
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 mt-4 text-center">
          {t('community.title')}
        </Text>
        <Text className="text-gray-500 dark:text-zinc-400 text-center mt-2 leading-5">
          {t('community.description')}
        </Text>
        <View className="bg-blue-50 dark:bg-blue-950 rounded-full px-4 py-1.5 mt-5">
          <Text className="text-nexa text-sm font-semibold">{t('community.badge')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
