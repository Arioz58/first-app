import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DismissKeyboard } from '../../components/DismissKeyboard';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { ROUND } from '../../lib/radius';

const NEXA = '#1E40AF';

type Friend = { id: string; name: string; photoUrl: string | null };

export default function NewChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  // Empêche un double POST si l'utilisateur tape deux fois sur la même ligne.
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Friend[]>('/friends')
      .then(setFriends)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = friends.filter((f) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const openChat = async (friend: Friend) => {
    if (opening) return;
    setOpening(friend.id);
    try {
      const conv = await apiRequest<{ id: string }>('/conversations/direct', {
        method: 'POST',
        body: { targetUserId: friend.id },
      });
      // `replace` : on ne veut pas revenir sur ce sélecteur avec le bouton retour.
      router.replace({
        pathname: '/chat/[id]' as any,
        params: { id: conv.id, name: friend.name },
      });
    } catch {
      setOpening(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-nexa">{t('new_chat.title')}</Text>
      </View>

      {/* `flex: 0` : sinon le Pressable (flex:1 par défaut) mangerait la place de la liste. */}
      <DismissKeyboard style={{ flex: 0 }}>
        <View className="px-4 py-3">
          <View style={ROUND.inner} className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3">
            <Ionicons name="search" size={18} color="#6B7280" />
            <TextInput
              className="flex-1 py-2.5 px-2 text-lg text-gray-900 dark:text-zinc-100"
              placeholder={t('friends.search_friends')}
              placeholderTextColor="#6B7280"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>
        </View>
      </DismissKeyboard>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={NEXA} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View className="items-center justify-center mt-20 px-8">
              <Text className="text-gray-400 dark:text-zinc-500 text-center">
                {friends.length === 0 ? t('friends.no_friends') : t('new_chat.no_results')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
              onPress={() => openChat(item)}
              disabled={!!opening}
            >
              <UserAvatar photoUrl={item.photoUrl} name={item.name} size={56} />
              <Text className="flex-1 ml-3 font-semibold text-gray-900 dark:text-zinc-100">{item.name}</Text>
              {opening === item.id && <ActivityIndicator size="small" color={NEXA} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
