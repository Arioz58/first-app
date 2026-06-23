import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { getUserId } from '../../lib/storage';
import StoriesBar, { type StoriesBarHandle } from '../../components/StoriesBar';

type Message = { id: string; content: string; createdAt: string; conversationId: string };
type Member = { userId: string; user: { name: string } };
type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  members: Member[];
  messages: Message[];
};

export default function ConversationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const storiesRef = useRef<StoriesBarHandle>(null);

  const fetchConversations = async () => {
    try {
      const data = await apiRequest<Conversation[]>('/conversations');
      setConversations(data);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    apiRequest<unknown[]>('/conversations/requests')
      .then((r) => setRequestCount(r.length))
      .catch(() => {});
  };

  useFocusEffect(useCallback(() => {
    getUserId().then(setCurrentUserId);
    fetchConversations();
  }, []));

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('new_message', (msg: Message) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const conv = { ...updated[idx], messages: [msg] };
        updated.splice(idx, 1);
        return [conv, ...updated];
      });
    });

    socket.on('added_to_group', () => fetchConversations());

    return () => {
      socket.off('new_message');
      socket.off('added_to_group');
    };
  }, []);

  const getConvName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name ?? t('chat.group');
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other?.user.name ?? t('chat.unknown');
  };

  const getLastMessage = (conv: Conversation) => {
    if (!conv.messages.length) return t('chat.no_messages');
    return conv.messages[0].content ?? t('chat.media');
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#128C7E" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-nexa">{t('messages')}</Text>
        <TouchableOpacity onPress={() => router.push('/group/new' as any)}>
          <Ionicons name="create-outline" size={24} color="#128C7E" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <StoriesBar ref={storiesRef} />
            {requestCount > 0 && (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3 border-b border-gray-100"
                onPress={() => router.push('/requests' as any)}
              >
                <View className="w-12 h-12 rounded-full bg-emerald-50 items-center justify-center mr-3">
                  <Ionicons name="mail-unread-outline" size={22} color="#128C7E" />
                </View>
                <Text className="flex-1 font-semibold text-gray-900">
                  {t('message_requests.title')}
                </Text>
                <View className="bg-red-500 rounded-full min-w-[22px] h-[22px] items-center justify-center px-1.5">
                  <Text className="text-white text-xs font-bold">{requestCount}</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        }
        alwaysBounceVertical
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchConversations();
              storiesRef.current?.refresh();
            }}
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Text className="text-gray-400">{t('chat.no_conversations')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row items-center px-4 py-3 border-b border-gray-50"
            onPress={() =>
              router.push({ pathname: '/chat/[id]' as any, params: { id: item.id, name: getConvName(item) } })
            }
          >
            <View className="w-12 h-12 rounded-full bg-emerald-50 items-center justify-center mr-3">
              <Ionicons
                name={item.type === 'group' ? 'people' : 'person'}
                size={22}
                color="#128C7E"
              />
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">{getConvName(item)}</Text>
              <Text className="text-gray-500 text-sm" numberOfLines={1}>{getLastMessage(item)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
