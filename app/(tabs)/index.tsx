import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { getUserId } from '../../lib/storage';
import { requestContactsSegment } from '../../lib/tabsNav';
import BottomSheet from '../../components/BottomSheet';
import StoriesBar, { type StoriesBarHandle } from '../../components/StoriesBar';
import { UserAvatar } from '../../components/UserAvatar';

const NEXA = '#128C7E';

// La tab bar native flotte au-dessus du contenu et `SafeAreaView` ne la connaît
// pas : on remonte le FAB de sa hauteur (~49pt) + une marge, sinon il passe dessous.
const FAB_BOTTOM = 96;

// Ombre portée du FAB (iOS + Android).
const FAB_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
  elevation: 6,
};

// Actions du FAB. Défini hors du composant : ne dépend que du router.
const FAB_ACTIONS: {
  key: 'new_group' | 'new_chat' | 'add_contact';
  icon: keyof typeof Ionicons.glyphMap;
  run: (router: ReturnType<typeof useRouter>) => void;
}[] = [
  { key: 'new_chat', icon: 'chatbubble-ellipses', run: (r) => r.push('/chat/new' as any) },
  { key: 'new_group', icon: 'people', run: (r) => r.push('/group/new' as any) },
  {
    key: 'add_contact',
    icon: 'person-add',
    run: (r) => {
      // Le segment est transmis par relais mémoire, pas par paramètre de route.
      requestContactsSegment('search');
      r.navigate('/(tabs)/search' as any);
    },
  },
];

const FILTERS = ['all', 'unread', 'favorites', 'groups'] as const;
type Filter = (typeof FILTERS)[number];

type Message = {
  id: string;
  senderId: string;
  content: string | null;
  type: string;
  mediaType: string | null;
  createdAt: string;
  conversationId?: string;
};
type Member = { userId: string; user: { id: string; name: string; photoUrl: string | null } };
type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  members: Member[];
  messages: Message[];
  unreadCount: number;
  pinnedAt: string | null;
  favoritedAt: string | null;
  mutedUntil: string | null;
  lastMessageAt: string;
};

// Même ordre que le backend : épinglées d'abord (plus récemment épinglée en tête),
// puis par date du dernier message. Rejoué côté client après chaque event socket.
const sortConversations = (list: Conversation[]) =>
  [...list].sort((a, b) => {
    if (a.pinnedAt && b.pinnedAt) return +new Date(b.pinnedAt) - +new Date(a.pinnedAt);
    if (a.pinnedAt) return -1;
    if (b.pinnedAt) return 1;
    return +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt);
  });

export default function ConversationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [fabOpen, setFabOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);
  const storiesRef = useRef<StoriesBarHandle>(null);
  // L'écouteur socket est monté une seule fois : il lit l'id via une ref, pas via le state.
  const currentUserIdRef = useRef<string | null>(null);

  const fetchConversations = async () => {
    try {
      const data = await apiRequest<Conversation[]>('/conversations');
      setConversations(sortConversations(data));
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    apiRequest<unknown[]>('/conversations/requests')
      .then((r) => setRequestCount(r.length))
      .catch(() => {});
  };

  useFocusEffect(
    useCallback(() => {
      getUserId().then((id) => {
        setCurrentUserId(id);
        currentUserIdRef.current = id;
      });
      fetchConversations();
    }, []),
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // `conversation_updated` (room `user:`) et non `new_message` (room `conv:`) :
    // seul le premier arrive pour une conversation qu'on n'a pas ouverte.
    socket.on(
      'conversation_updated',
      ({ conversationId, message }: { conversationId: string; message: Message }) => {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId);
          // Conversation inconnue (créée à l'instant) : on recharge la liste.
          if (idx === -1) {
            fetchConversations();
            return prev;
          }
          const fromMe = message.senderId === currentUserIdRef.current;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            messages: [message],
            lastMessageAt: message.createdAt,
            // Mes propres messages ne comptent jamais comme non lus. Si la
            // conversation est ouverte, le chat la remarque lue et le refetch
            // au retour sur cet écran remettra le compteur à zéro.
            unreadCount: fromMe ? updated[idx].unreadCount : updated[idx].unreadCount + 1,
          };
          return sortConversations(updated);
        });
      },
    );

    socket.on('added_to_group', () => fetchConversations());

    return () => {
      socket.off('conversation_updated');
      socket.off('added_to_group');
    };
  }, []);

  const getConvName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name ?? t('chat.group');
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other?.user.name ?? t('chat.unknown');
  };

  const getOtherMember = (conv: Conversation) =>
    conv.members.find((m) => m.userId !== currentUserId);

  // Aperçu du dernier message : les pièces jointes n'ont pas de texte.
  const getLastMessage = (conv: Conversation) => {
    const msg = conv.messages[0];
    if (!msg) return t('chat.no_messages');
    if (msg.mediaType) return t(`preview.${msg.mediaType}`, { defaultValue: t('chat.media') });
    return msg.content ?? t('chat.media');
  };

  // Aujourd'hui → heure, hier → « Hier », au-delà → date courte.
  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday');
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  };

  const isMuted = (conv: Conversation) =>
    !!conv.mutedUntil && new Date(conv.mutedUntil) > new Date();

  const unreadTotal = conversations.filter((c) => c.unreadCount > 0).length;

  const visible = conversations.filter((conv) => {
    if (filter === 'unread') return conv.unreadCount > 0;
    if (filter === 'favorites') return !!conv.favoritedAt;
    if (filter === 'groups') return conv.type === 'group';
    return true;
  });

  // Mise à jour optimiste puis appel serveur : le toggle doit répondre à l'instant.
  const toggleFlag = async (conv: Conversation, flag: 'pinnedAt' | 'favoritedAt') => {
    const active = !!conv[flag];
    const path = flag === 'pinnedAt' ? 'pin' : 'favorite';
    const body = flag === 'pinnedAt' ? { pinned: !active } : { favorite: !active };
    setConversations((prev) =>
      sortConversations(
        prev.map((c) =>
          c.id === conv.id ? { ...c, [flag]: active ? null : new Date().toISOString() } : c,
        ),
      ),
    );
    try {
      await apiRequest(`/conversations/${conv.id}/${path}`, { method: 'PATCH', body });
    } catch {
      fetchConversations(); // le serveur fait foi
    }
  };

  const markRead = async (conv: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
    );
    try {
      await apiRequest(`/conversations/${conv.id}/read`, { method: 'POST' });
    } catch {
      fetchConversations();
    }
  };

  const openChat = (conv: Conversation) => {
    // Remise à zéro immédiate : le chat marque la conversation lue à l'ouverture.
    if (conv.unreadCount > 0) {
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
      );
    }
    router.push({
      pathname: '/chat/[id]' as any,
      params: { id: conv.id, name: getConvName(conv) },
    });
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={NEXA} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-nexa">{t('messages')}</Text>
      </View>

      {/* Filtres façon WhatsApp. Le bouton « ajouter un filtre » reste à faire. */}
      <View className="flex-row px-4 pb-3">
        {FILTERS.map((f) => {
          const active = filter === f;
          const badge = f === 'unread' && unreadTotal > 0 ? unreadTotal : null;
          return (
            <TouchableOpacity
              key={f}
              className={`flex-row items-center rounded-full px-3.5 py-1.5 mr-2 ${
                active ? 'bg-nexa' : 'bg-gray-100'
              }`}
              onPress={() => setFilter(f)}
            >
              <Text
                className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-600'}`}
              >
                {t(`filters.${f}`)}
              </Text>
              {badge !== null && (
                <Text
                  className={`text-sm font-bold ml-1 ${active ? 'text-white' : 'text-nexa'}`}
                >
                  {badge}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {/* Les stories restent en tête de la liste non filtrée uniquement. */}
            {filter === 'all' && <StoriesBar ref={storiesRef} />}
            {filter === 'all' && requestCount > 0 && (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3 border-b border-gray-100"
                onPress={() => router.push('/requests' as any)}
              >
                <View className="w-12 h-12 rounded-full bg-emerald-50 items-center justify-center mr-3">
                  <Ionicons name="mail-unread-outline" size={22} color={NEXA} />
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
          <View className="items-center justify-center mt-20 px-8">
            <Text className="text-gray-400 text-center">
              {filter === 'all' ? t('chat.no_conversations') : t(`filters.empty_${filter}`)}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const unread = item.unreadCount > 0;
          const other = getOtherMember(item);
          return (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 border-b border-gray-50"
              onPress={() => openChat(item)}
              onLongPress={() => setActionTarget(item)}
              delayLongPress={300}
            >
              {item.type === 'group' ? (
                <View className="w-12 h-12 rounded-full bg-emerald-50 items-center justify-center">
                  <Ionicons name="people" size={22} color={NEXA} />
                </View>
              ) : (
                <UserAvatar photoUrl={other?.user.photoUrl} name={other?.user.name} size={48} />
              )}

              <View className="flex-1 ml-3">
                <View className="flex-row items-center">
                  {item.pinnedAt && (
                    <Ionicons name="pin" size={13} color="#9CA3AF" style={{ marginRight: 4 }} />
                  )}
                  <Text className="font-semibold text-gray-900 flex-shrink" numberOfLines={1}>
                    {getConvName(item)}
                  </Text>
                  {item.favoritedAt && (
                    <Ionicons name="star" size={13} color="#F59E0B" style={{ marginLeft: 4 }} />
                  )}
                  {isMuted(item) && (
                    <Ionicons
                      name="notifications-off"
                      size={13}
                      color="#9CA3AF"
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
                <Text
                  className={`text-sm ${unread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
                  numberOfLines={1}
                >
                  {getLastMessage(item)}
                </Text>
              </View>

              <View className="items-end ml-2">
                <Text className={`text-xs ${unread ? 'text-nexa font-semibold' : 'text-gray-400'}`}>
                  {formatDate(item.lastMessageAt)}
                </Text>
                {unread && (
                  <View className="bg-nexa rounded-full min-w-[20px] h-[20px] items-center justify-center px-1.5 mt-1">
                    <Text className="text-white text-xs font-bold">
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB « + » — remplace l'ancienne icône « nouveau groupe » du header. */}
      <TouchableOpacity
        className="absolute right-5 w-14 h-14 rounded-full bg-nexa items-center justify-center"
        style={[FAB_SHADOW, { bottom: FAB_BOTTOM }]}
        activeOpacity={0.85}
        onPress={() => setFabOpen(true)}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <BottomSheet visible={fabOpen} onClose={() => setFabOpen(false)}>
        <View className="pb-6 pt-2">
          {FAB_ACTIONS.map(({ key, icon, run }) => (
            <TouchableOpacity
              key={key}
              className="flex-row items-center px-5 py-4"
              onPress={() => {
                setFabOpen(false);
                run(router);
              }}
            >
              <View className="w-11 h-11 rounded-full bg-emerald-50 items-center justify-center mr-4">
                <Ionicons name={icon} size={22} color={NEXA} />
              </View>
              <Text className="text-base font-semibold text-gray-900">{t(`fab.${key}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Actions sur une conversation (appui long). */}
      <BottomSheet visible={!!actionTarget} onClose={() => setActionTarget(null)}>
        <View className="pb-6 pt-2">
          {actionTarget && (
            <>
              <Text className="px-5 pb-2 text-sm text-gray-400" numberOfLines={1}>
                {getConvName(actionTarget)}
              </Text>
              <ConvAction
                icon="pin"
                label={t(actionTarget.pinnedAt ? 'conv_actions.unpin' : 'conv_actions.pin')}
                onPress={() => {
                  toggleFlag(actionTarget, 'pinnedAt');
                  setActionTarget(null);
                }}
              />
              <ConvAction
                icon="star"
                label={t(
                  actionTarget.favoritedAt
                    ? 'conv_actions.unfavorite'
                    : 'conv_actions.favorite',
                )}
                onPress={() => {
                  toggleFlag(actionTarget, 'favoritedAt');
                  setActionTarget(null);
                }}
              />
              {actionTarget.unreadCount > 0 && (
                <ConvAction
                  icon="checkmark-done"
                  label={t('conv_actions.mark_read')}
                  onPress={() => {
                    markRead(actionTarget);
                    setActionTarget(null);
                  }}
                />
              )}
            </>
          )}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function ConvAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity className="flex-row items-center px-5 py-4" onPress={onPress}>
      <View className="w-11 h-11 rounded-full bg-emerald-50 items-center justify-center mr-4">
        <Ionicons name={icon} size={22} color={NEXA} />
      </View>
      <Text className="text-base font-semibold text-gray-900">{label}</Text>
    </TouchableOpacity>
  );
}
