import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { DismissKeyboard } from '../../components/DismissKeyboard';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { ROUND } from '../../lib/radius';
import { SearchUser, useUserSearch } from '../../lib/useUserSearch';

export default function NewGroupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // Pré-remplissage depuis un profil de conversation (« créer un groupe avec X »).
  const { prefillId, prefillName, prefillPhoto } = useLocalSearchParams<{
    prefillId?: string;
    prefillName?: string;
    prefillPhoto?: string;
  }>();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SearchUser[]>(
    prefillId
      ? [{ id: prefillId, name: prefillName ?? '', photoUrl: prefillPhoto || null }]
      : [],
  );
  const [loading, setLoading] = useState(false);
  const { results, loading: searching } = useUserSearch(query);

  const toggleMember = (user: SearchUser) => {
    setSelected((prev) =>
      prev.some((m) => m.id === user.id)
        ? prev.filter((m) => m.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || !selected.length) {
      Alert.alert(t('error'), t('group.name_member_required'));
      return;
    }
    setLoading(true);
    try {
      const conv = await apiRequest<{ id: string; name: string }>(
        '/conversations/group',
        {
          method: 'POST',
          body: { name, memberIds: selected.map((m) => m.id) },
        },
      );
      router.replace({
        pathname: '/chat/[id]' as any,
        params: { id: conv.id, name: conv.name },
      });
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <DismissKeyboard>
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#1E40AF" />
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
          {t('group.new_group')}
        </Text>
      </View>

      <View className="px-4 pt-4">
        <TextInput
          style={ROUND.inner}
          className="border border-gray-300 dark:border-zinc-700 px-4 py-3 text-lg text-gray-900 dark:text-zinc-100"
          placeholder={t('group.group_name')}
          placeholderTextColor="#6B7280"
          value={name}
          onChangeText={setName}
        />

        {/* Membres sélectionnés (chips) */}
        {selected.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {selected.map((m) => (
              <TouchableOpacity
                key={m.id}
                className="flex-row items-center bg-blue-50 dark:bg-blue-950 rounded-full pl-1 pr-2 py-1"
                onPress={() => toggleMember(m)}
              >
                <UserAvatar photoUrl={m.photoUrl} name={m.name} size={28} />
                <Text className="text-nexa text-base font-medium ml-1.5 mr-1">
                  {m.name}
                </Text>
                <Ionicons name="close-circle" size={16} color="#1E40AF" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text className="text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500 mt-5 mb-1">
          {t('group.add_members')}
        </Text>
        <View className="flex-row items-center bg-gray-100 dark:bg-zinc-800 rounded-full px-4">
          <Ionicons name="search" size={18} color="#6B7280" />
          <TextInput
            className="flex-1 py-2.5 px-2 text-lg text-gray-900 dark:text-zinc-100"
            placeholder={t('user_search.placeholder')}
            placeholderTextColor="#6B7280"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator color="#1E40AF" size="small" />}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 8 }}
        renderItem={({ item }) => {
          const isSelected = selected.some((m) => m.id === item.id);
          return (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
              onPress={() => toggleMember(item)}
            >
              <UserAvatar photoUrl={item.photoUrl} name={item.name} size={52} />
              <Text className="ml-3 flex-1 text-lg font-medium text-gray-900 dark:text-zinc-100">
                {item.name}
              </Text>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'add-circle-outline'}
                size={24}
                color={isSelected ? '#1E40AF' : '#9CA3AF'}
              />
            </TouchableOpacity>
          );
        }}
      />

      <View className="px-4 pb-4">
        <TouchableOpacity
          style={ROUND.inner}
          className={`py-4 items-center ${name.trim() && selected.length ? 'bg-nexa' : 'bg-gray-200 dark:bg-zinc-700'}`}
          onPress={handleCreate}
          disabled={loading || !name.trim() || !selected.length}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              className={`font-semibold text-lg ${name.trim() && selected.length ? 'text-white' : 'text-gray-400 dark:text-zinc-500'}`}
            >
              {t('group.create')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      </DismissKeyboard>
    </SafeAreaView>
  );
}
