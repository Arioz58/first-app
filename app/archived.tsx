import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ConversationRow,
  useConversationLabels,
  type RowConversation,
} from '../components/ConversationRow';
import { ConversationSwipe } from '../components/ConversationSwipe';
import { apiRequest } from '../lib/api';
import { getUserId } from '../lib/storage';

const NEXA = '#1E40AF';

/**
 * Conversations rangées hors de la liste principale.
 *
 * Elles y restent même quand un message arrive (choix assumé : archiver doit avoir un effet
 * durable) et ne comptent pas dans les pastilles — leur compteur de non-lus n'apparaît que
 * sur l'entrée « Archivées » de la liste et ici.
 */
export default function ArchivedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<RowConversation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { getConvName } = useConversationLabels(currentUserId);

  const fetchArchived = useCallback(async () => {
    try {
      const data = await apiRequest<RowConversation[]>('/conversations');
      setConversations(data.filter((c) => c.archivedAt));
    } catch {
      // Hors ligne : on garde ce qui est déjà affiché.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      getUserId().then(setCurrentUserId);
      fetchArchived();
    }, [fetchArchived]),
  );

  const unarchive = async (conv: RowConversation) => {
    // La ligne quitte l'écran tout de suite : elle n'a plus rien à y faire.
    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    try {
      await apiRequest(`/conversations/${conv.id}/archive`, {
        method: 'PATCH',
        body: { archived: false },
      });
    } catch {
      fetchArchived(); // le serveur fait foi
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity onPress={() => router.back()} className="pr-3 py-1">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-nexa">{t('archived.title')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" color={NEXA} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View className="items-center justify-center mt-24 px-10">
              <Ionicons name="archive-outline" size={44} color="#D1D5DB" />
              <Text className="text-gray-400 dark:text-zinc-500 text-center mt-3">
                {t('archived.empty')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ConversationSwipe
              left={[]}
              right={[
                {
                  key: 'unarchive',
                  icon: 'arrow-up-circle',
                  label: t('conv_actions.unarchive'),
                  color: NEXA,
                  onPress: () => unarchive(item),
                },
              ]}
            >
              <ConversationRow
                conv={item}
                currentUserId={currentUserId}
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]' as any,
                    params: {
                      id: item.id,
                      name: getConvName(item),
                      photo:
                        (item.type === 'group'
                          ? item.photoUrl
                          : item.members.find((m) => m.userId !== currentUserId)?.user
                              .photoUrl) ?? '',
                      type: item.type,
                    },
                  })
                }
              />
            </ConversationSwipe>
          )}
        />
      )}
    </SafeAreaView>
  );
}
