import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { connectSocket, getSocket } from '../../lib/socket';
import {
  getChatWallpaper,
  setChatWallpaper,
  getConversationCustomization,
  getConversationClearedAt,
  setConversationClearedAt,
  type ConversationCustomization,
} from '../../lib/storage';
import type { ChatWallpaper } from '../../lib/chatWallpapers';
import { resolveBubbleColor } from '../../lib/bubbleColors';
import { ChatBackground } from '../../components/ChatBackground';
import ChatWallpaperPicker from '../../components/ChatWallpaperPicker';
import { UserAvatar } from '../../components/UserAvatar';

const NEXA = '#128C7E';

type ConvMember = { userId: string; role: string; user: { id: string; name: string; photoUrl: string | null } };
type ConvMeta = { id: string; type: 'direct' | 'group'; name: string | null; members: ConvMember[] };
type HeaderProfile = { photoUrl: string | null; canCall: boolean; lastSeenAt: string | null };

// Légère ombre portée sur les bulles → lisibles sur n'importe quel fond.
const BUBBLE_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 1.5,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

type Sender = { id: string; name: string };
type Message = {
  id: string;
  content: string;
  createdAt: string;
  sender: Sender;
  conversationId?: string;
  type?: string;
  storyId?: string | null;
  storyMediaUrl?: string | null;
};

// Détecte une réaction emoji seule (≤ 8 pictogrammes) → affichage géant hors bulle
const isEmojiOnly = (raw?: string | null): boolean => {
  const t = (raw ?? '').trim();
  if (!t) return false;
  // retire espaces, ZWJ (‍) et variation selector (️)
  const stripped = t.replace(/[\s‍️]/gu, '');
  if (!stripped || [...stripped].length > 8) return false;
  return /^\p{Extended_Pictographic}+$/u.test(stripped);
};

export default function ChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [convType, setConvType] = useState<'direct' | 'group'>('direct');
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [header, setHeader] = useState<HeaderProfile | null>(null);
  const [custom, setCustom] = useState<ConversationCustomization>({});
  const [clearedAt, setClearedAt] = useState<number | null>(null);
  const [wallpaper, setWallpaper] = useState<ChatWallpaper | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Personnalisations locales rechargées à chaque focus (modifiables depuis le panneau de détails).
  useFocusEffect(
    useCallback(() => {
      getChatWallpaper(id).then(setWallpaper);
      getConversationCustomization(id).then(setCustom);
      getConversationClearedAt(id).then(setClearedAt);
    }, [id]),
  );

  // Aperçu live : on applique + persiste immédiatement sans fermer la feuille.
  const handleSelectWallpaper = (w: ChatWallpaper | null) => {
    setWallpaper(w);
    setChatWallpaper(id, w);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const me = await apiRequest<{ id: string }>('/users/me');
        setCurrentUserId(me.id);

        // Métadonnées de la conversation → identifier l'autre participant (conv directe).
        const meta = await apiRequest<ConvMeta>(`/conversations/${id}`);
        setConvType(meta.type);
        if (meta.type === 'direct') {
          const other = meta.members.find((m) => m.userId !== me.id);
          if (other) {
            setOtherUserId(other.userId);
            // En-tête gated (re-vérifié serveur) : photo, autorisation d'appel, dernière connexion.
            apiRequest<HeaderProfile>(`/users/${other.userId}/profile`)
              .then((p) =>
                setHeader({ photoUrl: p.photoUrl, canCall: p.canCall, lastSeenAt: p.lastSeenAt }),
              )
              .catch(() => {});
          }
        }

        const history = await apiRequest<Message[]>(`/conversations/${id}/messages`);
        setMessages(history.reverse());

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

  // --- Valeurs dérivées ---
  const displayName = custom.nickname || name || '';
  const bubbleColor = resolveBubbleColor(custom.bubbleColor);
  // « Effacer » local : on masque les messages antérieurs à l'horodatage stocké.
  const visibleMessages = clearedAt
    ? messages.filter((m) => new Date(m.createdAt).getTime() > clearedAt)
    : messages;
  // Sous-titre (priorité : frappe > en ligne > vu le… > rien) — frappe/en ligne = Phase B.
  const subtitle = header?.lastSeenAt
    ? t('chat.seen_at', { value: formatSeen(header.lastSeenAt) })
    : '';

  const openDetails = () => {
    if (convType !== 'direct' || !otherUserId) return;
    router.push({
      pathname: '/chat/details' as any,
      params: { conversationId: id, userId: otherUserId, name: displayName },
    });
  };

  const clearChat = () => {
    Alert.alert(t('details.clear_chat'), t('details.clear_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('details.clear_chat'),
        style: 'destructive',
        onPress: async () => {
          const ts = Date.now();
          await setConversationClearedAt(id, ts);
          setClearedAt(ts);
        },
      },
    ]);
  };

  const confirmBlock = () => {
    if (!otherUserId) return;
    Alert.alert(t('moderation.block_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () =>
          apiRequest('/blocks', { method: 'POST', body: { userId: otherUserId } })
            .then(() => router.replace('/(tabs)'))
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);
  };

  const openReport = () => {
    if (!otherUserId) return;
    const cats = ['spam', 'impersonation', 'inappropriate', 'other'];
    Alert.alert(t('moderation.report_category'), '', [
      ...cats.map((c) => ({
        text: t(`moderation.${c}`),
        onPress: () =>
          apiRequest('/reports', { method: 'POST', body: { userId: otherUserId, category: c } })
            .then(() => Alert.alert(t('moderation.report_done')))
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  const comingSoon = () => Alert.alert('', t('details.coming_soon'));

  const openMenu = () => {
    const direct = convType === 'direct' && !!otherUserId;
    Alert.alert(displayName, undefined, [
      { text: t('details.search'), onPress: comingSoon },
      { text: t('details.mute'), onPress: comingSoon },
      { text: t('details.ephemeral'), onPress: comingSoon },
      { text: t('chat.wallpaper'), onPress: () => setPickerOpen(true) },
      { text: t('details.clear_chat'), style: 'destructive', onPress: clearChat },
      ...(direct
        ? [
            { text: t('moderation.block'), style: 'destructive' as const, onPress: confirmBlock },
            { text: t('moderation.report'), onPress: openReport },
          ]
        : []),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
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
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="px-1 py-1">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>

        {/* Avatar + point de statut */}
        <TouchableOpacity onPress={openDetails} disabled={convType !== 'direct'} className="ml-1">
          {convType === 'group' ? (
            <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center">
              <Ionicons name="people" size={20} color={NEXA} />
            </View>
          ) : (
            <View>
              <UserAvatar photoUrl={header?.photoUrl ?? null} name={displayName} size={40} />
              {/* vert = en ligne / gris = hors ligne — présence temps réel branchée en Phase B */}
              <View className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white bg-gray-400" />
            </View>
          )}
        </TouchableOpacity>

        {/* Nom (tronqué) + sous-titre dynamique */}
        <TouchableOpacity
          className="flex-1 ml-3"
          onPress={openDetails}
          disabled={convType !== 'direct'}
        >
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {displayName}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-gray-400" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* Boutons d'appel (grisés selon canCall serveur) — appels = Mois 4 */}
        {convType === 'direct' ? (
          <>
            <TouchableOpacity
              className="px-2 py-1"
              style={{ opacity: header?.canCall ? 1 : 0.4 }}
              onPress={() =>
                Alert.alert(
                  '',
                  header?.canCall ? t('details.calls_coming') : t('details.call_unavailable'),
                )
              }
            >
              <Ionicons name="call" size={21} color={NEXA} />
            </TouchableOpacity>
            <TouchableOpacity
              className="px-2 py-1"
              style={{ opacity: header?.canCall ? 1 : 0.4 }}
              onPress={() =>
                Alert.alert(
                  '',
                  header?.canCall ? t('details.calls_coming') : t('details.call_unavailable'),
                )
              }
            >
              <Ionicons name="videocam" size={21} color={NEXA} />
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity className="px-2 py-1" onPress={openMenu}>
          <Ionicons name="ellipsis-vertical" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ChatBackground wallpaper={wallpaper}>
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender?.id === currentUserId;
            const isStoryReply = item.type === 'story_reply' || !!item.storyMediaUrl;
            const reaction = isStoryReply && isEmojiOnly(item.content);

            return (
              <View
                className={`max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
              >
                {isStoryReply ? (
                  <>
                    {/* Libellé contextuel : répondu / réagi */}
                    <View
                      className={`flex-row items-center gap-1 mb-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}
                    >
                      <Ionicons name="arrow-undo" size={12} color="#9CA3AF" />
                      <Text className="text-[11px] text-gray-400">
                        {reaction
                          ? isMe
                            ? t('chat.you_reacted')
                            : t('chat.reacted', { name: item.sender?.name })
                          : isMe
                            ? t('chat.you_replied')
                            : t('chat.replied', { name: item.sender?.name })}
                      </Text>
                    </View>

                    {/* Vignette verticale de la story */}
                    {item.storyMediaUrl && (
                      <Image
                        source={{ uri: item.storyMediaUrl }}
                        className="rounded-xl border border-gray-200 bg-gray-100 mb-1"
                        style={{ width: 50, height: 84 }}
                      />
                    )}

                    {/* Réaction emoji en grand, ou bulle de texte */}
                    {reaction ? (
                      <Text style={{ fontSize: 50, lineHeight: 58 }} className="px-1">
                        {item.content}
                      </Text>
                    ) : (
                      <View
                        style={[BUBBLE_SHADOW, isMe ? { backgroundColor: bubbleColor } : null]}
                        className={`rounded-2xl px-4 py-2 ${isMe ? '' : 'bg-white'}`}
                      >
                        <Text className={isMe ? 'text-white' : 'text-gray-900'}>
                          {item.content}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {!isMe && (
                      <Text className="text-xs text-gray-400 mb-1 ml-1">{item.sender?.name}</Text>
                    )}
                    <View
                      style={[BUBBLE_SHADOW, isMe ? { backgroundColor: bubbleColor } : null]}
                      className={`rounded-2xl px-4 py-2 ${isMe ? '' : 'bg-white'}`}
                    >
                      <Text className={isMe ? 'text-white' : 'text-gray-900'}>
                        {item.content}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            );
          }}
        />
        </ChatBackground>

        {/* Input */}
        <View className="flex-row items-center px-3 py-2 border-t border-gray-100">
          <TextInput
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2 text-base"
            placeholder={t('chat.message_placeholder')}
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            className="w-10 h-10 bg-nexa rounded-full items-center justify-center"
            onPress={sendMessage}
          >
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ChatWallpaperPicker
        visible={pickerOpen}
        current={wallpaper}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectWallpaper}
      />
    </SafeAreaView>
  );
}

// « Vu le JJ/MM à HH:MM » (utilisé par le sous-titre du header).
function formatSeen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}
