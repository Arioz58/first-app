import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { SearchUser, useUserSearch } from '../../lib/useUserSearch';

export default function SearchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const { results, loading } = useUserSearch(query);

  const openConversation = async (user: SearchUser) => {
    if (opening) return;
    setOpening(true);
    try {
      const conv = await apiRequest<{ id: string }>('/conversations/direct', {
        method: 'POST',
        body: { targetUserId: user.id },
      });
      router.push({
        pathname: '/chat/[id]' as any,
        params: { id: conv.id, name: user.name },
      });
    } catch {
      // échec silencieux (réseau)
    } finally {
      setOpening(false);
    }
  };

  const hasQuery = query.trim().length >= 2;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 py-3">
        <Text className="text-2xl font-bold text-nexa mb-3">{t('tabs.search')}</Text>
        <View className="flex-row items-center bg-gray-100 rounded-full px-4">
          <Ionicons name="search" size={18} color="#6B7280" />
          <TextInput
            className="flex-1 py-2.5 px-2 text-base"
            placeholder={t('user_search.placeholder')}
            placeholderTextColor="#6B7280"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View className="items-center justify-center mt-24 px-10">
            {loading ? (
              <ActivityIndicator color="#128C7E" />
            ) : (
              <Text className="text-gray-400 text-center">
                {hasQuery ? t('user_search.no_results') : t('user_search.hint')}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row items-center px-4 py-3 border-b border-gray-50"
            onPress={() => openConversation(item)}
            disabled={opening}
          >
            <UserAvatar photoUrl={item.photoUrl} name={item.name} size={44} />
            <Text className="ml-3 flex-1 text-base font-medium text-gray-900">
              {item.name}
            </Text>
            <Ionicons name="chatbubble-outline" size={20} color="#128C7E" />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
