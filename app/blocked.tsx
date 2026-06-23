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

const NEXA = '#128C7E';
type Blocked = { id: string; name: string; photoUrl: string | null };

export default function BlockedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [users, setUsers] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setUsers(await apiRequest<Blocked[]>('/blocks'));
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = (userId: string) =>
    apiRequest(`/blocks/${userId}`, { method: 'DELETE' })
      .then(load)
      .catch((e: any) => Alert.alert(t('error'), e.message));

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900">
          {t('moderation.blocked_users')}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={NEXA} className="mt-10" />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View className="items-center justify-center mt-24">
              <Text className="text-gray-400">{t('moderation.no_blocked')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center px-4 py-3 border-b border-gray-50">
              <UserAvatar photoUrl={item.photoUrl} name={item.name} size={44} />
              <Text className="flex-1 ml-3 text-base font-medium text-gray-900">
                {item.name}
              </Text>
              <TouchableOpacity
                className="border border-gray-300 rounded-full px-4 py-1.5"
                onPress={() => unblock(item.id)}
              >
                <Text className="text-gray-700 text-sm font-semibold">
                  {t('moderation.unblock')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
