import { useEffect, useState, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { connectSocket, getSocket } from '../../lib/socket';

type Sender = { id: string; name: string };
type Message = { id: string; content: string; createdAt: string; sender: Sender; conversationId?: string };

export default function ChatScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // Récupérer le profil pour connaître l'userId courant
        const me = await apiRequest<{ id: string }>('/users/me');
        setCurrentUserId(me.id);

        // Historique des messages
        const history = await apiRequest<Message[]>(`/conversations/${id}/messages`);
        setMessages(history.reverse());

        // Rejoindre la room Socket.io
        const socket = await connectSocket();
        socket.emit('join_conversation', id);

        socket.on('new_message', (msg: Message) => {
          if (msg.conversationId === id || !msg.conversationId) {
            setMessages((prev) => [...prev, msg]);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
          }
        });

        socket.on('removed_from_group', ({ conversationId }: { conversationId: string }) => {
          if (conversationId === id) router.replace('/(tabs)');
        });
      } catch {
        router.replace('/(tabs)');
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      const socket = getSocket();
      socket?.off('new_message');
      socket?.off('removed_from_group');
    };
  }, [id]);

  const sendMessage = () => {
    const content = text.trim();
    if (!content) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit('send_message', { conversationId: id, content });
    setText('');
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
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#1E40AF" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900 flex-1">{name}</Text>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender?.id === currentUserId;
            return (
              <View className={`max-w-[75%] ${isMe ? 'self-end' : 'self-start'}`}>
                {!isMe && (
                  <Text className="text-xs text-gray-400 mb-1 ml-1">{item.sender?.name}</Text>
                )}
                <View className={`rounded-2xl px-4 py-2 ${isMe ? 'bg-blue-800' : 'bg-gray-100'}`}>
                  <Text className={isMe ? 'text-white' : 'text-gray-900'}>{item.content}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Input */}
        <View className="flex-row items-center px-3 py-2 border-t border-gray-100">
          <TextInput
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2 text-base"
            placeholder="Message..."
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            className="w-10 h-10 bg-blue-800 rounded-full items-center justify-center"
            onPress={sendMessage}
          >
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
