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
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
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
              className={`flex-1 items-center py-2 rounded-full mx-1 ${active ? 'bg-nexa' : 'bg-gray-100'}`}
              onPress={() => setSeg(s)}
            >
              <Text className={`text-base font-semibold ${active ? 'text-white' : 'text-gray-600'}`}>
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        apiRequest<RequestItem[]>('/friends/requests/received'),
        apiRequest<Suggestion[]>('/friends/suggestions'),
      ]);
      setReceived(r);
      setSuggestions(s);
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

  const empty = received.length === 0 && suggestions.length === 0;

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
      {empty ? (
        <View className="items-center justify-center mt-24 px-10">
          <Ionicons name="people-outline" size={48} color="#D1D5DB" />
          <Text className="text-gray-400 text-center mt-3">{t('activity.empty')}</Text>
        </View>
      ) : null}

      {/* Demandes d'ami reçues */}
      {received.length > 0 ? (
        <View className="mt-2">
          <Text className="text-sm font-semibold text-gray-400 uppercase px-5 pb-2">
            {t('activity.requests')}
          </Text>
          {received.map((r) => (
            <View key={r.requestId} className="flex-row items-center px-4 py-3">
              <TouchableOpacity onPress={() => router.push({ pathname: '/user/[id]' as any, params: { id: r.user.id } })}>
                <UserAvatar photoUrl={r.user.photoUrl} name={r.user.name} size={56} />
              </TouchableOpacity>
              <Text className="flex-1 ml-3 font-semibold text-gray-900" numberOfLines={1}>
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
                className="bg-gray-100 rounded-full px-4 py-2"
                disabled={acting === r.requestId}
                onPress={() => refuse(r.requestId)}
              >
                <Text className="text-gray-600 text-base font-semibold">{t('relation.refuse')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {/* Suggestions : personnes que tu connais peut-être */}
      {suggestions.length > 0 ? (
        <View className="mt-4">
          <Text className="text-sm font-semibold text-gray-400 uppercase px-5 pb-2">
            {t('activity.suggestions')}
          </Text>
          {suggestions.map((s) => (
            <View key={s.id} className="flex-row items-center px-4 py-3">
              <TouchableOpacity onPress={() => router.push({ pathname: '/user/[id]' as any, params: { id: s.id } })}>
                <UserAvatar photoUrl={s.photoUrl} name={s.name} size={56} />
              </TouchableOpacity>
              <View className="flex-1 ml-3">
                <Text className="font-semibold text-gray-900" numberOfLines={1}>{s.name}</Text>
                {s.mutualFriendsCount > 0 ? (
                  <Text className="text-gray-400 text-sm">
                    {t(
                      s.mutualFriendsCount === 1
                        ? 'profile_view.mutual_one'
                        : 'profile_view.mutual_other',
                      { count: s.mutualFriendsCount },
                    )}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                className="flex-row items-center bg-blue-50 rounded-full px-4 py-2"
                disabled={acting === s.id}
                onPress={() => addFriend(s.id)}
              >
                <Ionicons name="person-add" size={15} color={NEXA} />
                <Text className="text-nexa text-base font-semibold ml-1.5">{t('relation.add_friend')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

// Coquille assumée : la gamification (points/classement) et le B2B arrivent au Mois 5.
function CommunityTab() {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 items-center justify-center px-10 mt-16">
        <View className="w-20 h-20 rounded-3xl bg-blue-50 items-center justify-center">
          <Ionicons name="trophy" size={36} color={NEXA} />
        </View>
        <Text className="text-xl font-bold text-gray-900 mt-4 text-center">
          {t('community.title')}
        </Text>
        <Text className="text-gray-500 text-center mt-2 leading-5">
          {t('community.description')}
        </Text>
        <View className="bg-blue-50 rounded-full px-4 py-1.5 mt-5">
          <Text className="text-nexa text-sm font-semibold">{t('community.badge')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
