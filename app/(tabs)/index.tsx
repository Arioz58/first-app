import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { getUserId } from '../../lib/storage';

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchConversations = async () => {
    try {
      const data = await apiRequest<Conversation[]>('/conversations');
      setConversations(data);
    } catch (e: any) {
      if (e.message === 'SESSION_EXPIRED') router.replace('/(auth)/login');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
    if (conv.type === 'group') return conv.name ?? 'Groupe';
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other?.user.name ?? 'Inconnu';
  };

  const getLastMessage = (conv: Conversation) => {
    if (!conv.messages.length) return 'Aucun message';
    return conv.messages[0].content ?? '📎 Média';
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-blue-800">Messages</Text>
        <TouchableOpacity onPress={() => router.push('/group/new' as any)}>
          <Ionicons name="create-outline" size={24} color="#1E40AF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        alwaysBounceVertical
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchConversations(); }}
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Text className="text-gray-400">Aucune conversation</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row items-center px-4 py-3 border-b border-gray-50"
            onPress={() =>
              router.push({ pathname: '/chat/[id]' as any, params: { id: item.id, name: getConvName(item) } })
            }
          >
            <View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center mr-3">
              <Ionicons
                name={item.type === 'group' ? 'people' : 'person'}
                size={22}
                color="#1E40AF"
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
