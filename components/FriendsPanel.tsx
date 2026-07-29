import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { setPendingFriendRequests } from '../lib/friendRequests';
import { UserAvatar } from './UserAvatar';

type Friend = { id: string; name: string; photoUrl: string | null };
type RequestItem = {
  requestId: string;
  createdAt: string;
  user: Friend;
};

type Sub = 'friends' | 'received' | 'sent';

export function FriendsPanel({
  onOpenProfile,
}: {
  onOpenProfile: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<Sub>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [received, setReceived] = useState<RequestItem[]>([]);
  const [sent, setSent] = useState<RequestItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r, s] = await Promise.all([
        apiRequest<Friend[]>('/friends'),
        apiRequest<RequestItem[]>('/friends/requests/received'),
        apiRequest<RequestItem[]>('/friends/requests/sent'),
      ]);
      setFriends(f);
      setReceived(r);
      setSent(s);
      // `load()` est rejoué au focus et après chaque accept/refuse : c'est le
      // point unique qui resynchronise le badge de l'onglet Contacts.
      setPendingFriendRequests(r.length);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const accept = (id: string) =>
    run(() => apiRequest(`/friends/requests/${id}/accept`, { method: 'POST' }));
  const refuse = (id: string) =>
    run(() => apiRequest(`/friends/requests/${id}/refuse`, { method: 'POST' }));
  const cancel = (id: string) =>
    run(() => apiRequest(`/friends/requests/${id}`, { method: 'DELETE' }));
  const remove = (userId: string) =>
    Alert.alert(t('friends.remove_title'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('relation.remove_friend'),
        style: 'destructive',
        onPress: () => run(() => apiRequest(`/friends/${userId}`, { method: 'DELETE' })),
      },
    ]);

  const filteredFriends = friends.filter((f) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const TABS: { key: Sub; label: string; badge?: number }[] = [
    { key: 'friends', label: t('friends.my_friends') },
    { key: 'received', label: t('friends.received'), badge: received.length },
    { key: 'sent', label: t('friends.sent') },
  ];

  return (
    <View className="flex-1">
      {/* Sous-onglets */}
      <View className="flex-row px-4 gap-2 mb-1">
        {TABS.map((tab) => {
          const active = sub === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              className={`flex-row items-center px-3 py-1.5 rounded-full ${active ? 'bg-nexa' : 'bg-gray-100 dark:bg-zinc-800'}`}
              onPress={() => setSub(tab.key)}
            >
              <Text className={`text-base font-medium ${active ? 'text-white' : 'text-gray-600 dark:text-zinc-300'}`}>
                {tab.label}
              </Text>
              {tab.badge ? (
                <View className="ml-1.5 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                  <Text className="text-white text-[11px] font-bold">{tab.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {sub === 'friends' && (
        <View className="px-4 pt-2">
          <View className="flex-row items-center bg-gray-100 dark:bg-zinc-800 rounded-full px-4">
            <Ionicons name="search" size={16} color="#6B7280" />
            <TextInput
              className="flex-1 py-2 px-2 text-lg text-gray-900 dark:text-zinc-100"
              placeholder={t('friends.search_friends')}
              placeholderTextColor="#6B7280"
              value={query}
              onChangeText={setQuery}
            />
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#1E40AF" className="mt-10" />
      ) : sub === 'friends' ? (
        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={<Empty text={t('friends.no_friends')} />}
          renderItem={({ item }) => (
            <Row user={item} onPress={() => onOpenProfile(item.id)}>
              <TouchableOpacity onPress={() => remove(item.id)} className="p-1">
                <Ionicons name="person-remove-outline" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </Row>
          )}
        />
      ) : sub === 'received' ? (
        <FlatList
          data={received}
          keyExtractor={(item) => item.requestId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={<Empty text={t('friends.no_received')} />}
          renderItem={({ item }) => (
            <Row
              user={item.user}
              subtitle={new Date(item.createdAt).toLocaleDateString()}
              onPress={() => onOpenProfile(item.user.id)}
            >
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-nexa rounded-full px-3 py-1.5"
                  onPress={() => accept(item.requestId)}
                >
                  <Text className="text-white text-sm font-semibold">
                    {t('relation.accept')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="border border-gray-300 dark:border-zinc-700 rounded-full px-3 py-1.5"
                  onPress={() => refuse(item.requestId)}
                >
                  <Text className="text-gray-600 dark:text-zinc-300 text-sm font-semibold">
                    {t('relation.refuse')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Row>
          )}
        />
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(item) => item.requestId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={<Empty text={t('friends.no_sent')} />}
          renderItem={({ item }) => (
            <Row user={item.user} onPress={() => onOpenProfile(item.user.id)}>
              <TouchableOpacity
                className="border border-gray-300 dark:border-zinc-700 rounded-full px-3 py-1.5"
                onPress={() => cancel(item.requestId)}
              >
                <Text className="text-gray-600 dark:text-zinc-300 text-sm font-semibold">
                  {t('relation.cancel_request')}
                </Text>
              </TouchableOpacity>
            </Row>
          )}
        />
      )}
    </View>
  );
}

function Row({
  user,
  subtitle,
  onPress,
  children,
}: {
  user: Friend;
  subtitle?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
      onPress={onPress}
    >
      <UserAvatar photoUrl={user.photoUrl} name={user.name} size={52} />
      <View className="flex-1 ml-3">
        <Text className="text-lg font-medium text-gray-900 dark:text-zinc-100">{user.name}</Text>
        {subtitle ? <Text className="text-gray-400 dark:text-zinc-500 text-sm">{subtitle}</Text> : null}
      </View>
      {children}
    </TouchableOpacity>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="items-center justify-center mt-20">
      <Text className="text-gray-400 dark:text-zinc-500">{text}</Text>
    </View>
  );
}
