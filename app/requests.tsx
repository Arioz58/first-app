import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAvatar } from '../components/UserAvatar';
import { apiRequest } from '../lib/api';
import { getUserId } from '../lib/storage';

const NEXA = '#128C7E';

type Member = { userId: string; user: { id: string; name: string; photoUrl: string | null } };
type Message = { content: string | null };
type Conversation = { id: string; members: Member[]; messages: Message[] };

export default function RequestsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, uid] = await Promise.all([
        apiRequest<Conversation[]>('/conversations/requests'),
        getUserId(),
      ]);
      setRequests(data);
      setMe(uid);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = (id: string) =>
    apiRequest(`/conversations/${id}/accept-request`, { method: 'POST' })
      .then(load)
      .catch((e: any) => Alert.alert(t('error'), e.message));

  const decline = (id: string) =>
    apiRequest(`/conversations/${id}/request`, { method: 'DELETE' })
      .then(load)
      .catch((e: any) => Alert.alert(t('error'), e.message));

  const other = (c: Conversation) => c.members.find((m) => m.user.id !== me)?.user;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900">
          {t('message_requests.title')}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={NEXA} className="mt-10" />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View className="items-center justify-center mt-24">
              <Text className="text-gray-400">{t('message_requests.empty')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const u = other(item);
            return (
              <View className="px-4 py-3 border-b border-gray-50">
                <TouchableOpacity
                  className="flex-row items-center"
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[id]' as any,
                      params: { id: item.id, name: u?.name ?? '' },
                    })
                  }
                >
                  <UserAvatar photoUrl={u?.photoUrl} name={u?.name} size={48} />
                  <View className="flex-1 ml-3">
                    <Text className="text-base font-semibold text-gray-900">
                      {u?.name}
                    </Text>
                    <Text className="text-gray-500 text-sm" numberOfLines={1}>
                      {item.messages[0]?.content ?? ''}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View className="flex-row gap-3 mt-2 ml-[60px]">
                  <TouchableOpacity
                    className="bg-nexa rounded-full px-5 py-1.5"
                    onPress={() => accept(item.id)}
                  >
                    <Text className="text-white text-sm font-semibold">
                      {t('relation.accept')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="border border-gray-300 rounded-full px-5 py-1.5"
                    onPress={() => decline(item.id)}
                  >
                    <Text className="text-gray-600 text-sm font-semibold">
                      {t('message_requests.decline')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
