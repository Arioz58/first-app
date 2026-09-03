import { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { requestScrollToMessage } from '../../lib/chatNav';
import { ROUND } from '../../lib/radius';
import { getSocket } from '../../lib/socket';
import {
  bumpUnread,
  clearUnread,
  setConversationUnread,
  setUnreadCounts,
} from '../../lib/unreadMessages';
import { getUserId, setConversationClearedAt } from '../../lib/storage';
import { requestContactsSegment } from '../../lib/tabsNav';
import { useThemeColors } from '../../lib/theme';
import BottomSheet from '../../components/BottomSheet';
import { UserAvatar } from '../../components/UserAvatar';
import { ConversationRow } from '../../components/ConversationRow';
import { ConversationSwipe } from '../../components/ConversationSwipe';

const NEXA = '#1E40AF';

// La tab bar native flotte au-dessus du contenu et `SafeAreaView` ne la connaît
// pas : on remonte le FAB de sa hauteur (~49pt) + une marge, sinon il passe dessous.
const FAB_BOTTOM = 96;
/**
 * Sourdine « toujours » — même sentinelle que dans le chat (`app/chat/[id].tsx`).
 *
 * ⚠️ Une date lointaine plutôt qu'une valeur spéciale : le serveur compare simplement à
 * maintenant, et un troisième état serait à gérer partout où la sourdine est lue.
 */
const MUTE_FOREVER = new Date('2999-12-31T00:00:00Z').toISOString();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();
/** En sourdine à cet instant ? (une échéance passée ne compte plus). */
const isMuted = (conv: { mutedUntil?: string | null }) =>
  !!conv.mutedUntil && new Date(conv.mutedUntil) > new Date();

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
      requestContactsSegment('directory');
      r.navigate('/(tabs)/search' as any);
    },
  },
];

const FILTERS = ['all', 'unread', 'favorites', 'groups'] as const;
type Filter = (typeof FILTERS)[number];

// Résultat de recherche dans le contenu des messages (backend).
type SearchMsg = {
  id: string;
  content: string | null;
  createdAt: string;
  conversationId: string;
  conversation: {
    type: 'direct' | 'group';
    name: string | null;
    photoUrl: string | null; // groupes
    members: { userId: string; user: { id: string; name: string; photoUrl: string | null } }[];
  };
};
type FriendLite = { id: string; name: string; photoUrl: string | null };

type Message = {
  id: string;
  senderId: string;
  content: string | null;
  type: string;
  mediaType: string | null;
  createdAt: string;
  conversationId?: string;
  /** Médias d'un même envoi : plusieurs messages, une seule bulle chez le destinataire. */
  batchId?: string | null;
};
type Member = { userId: string; user: { id: string; name: string; photoUrl: string | null } };
type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  photoUrl: string | null; // groupes
  members: Member[];
  messages: Message[];
  unreadCount: number;
  manualUnread: boolean; // remise en non lu à la main : pastille sans nombre
  pinnedAt: string | null;
  favoritedAt: string | null;
  archivedAt: string | null; // rangée dans les archives (hors de cette liste)
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
  /**
   * Action de feuille différée jusqu'au DÉMONTAGE de celle-ci.
   *
   * Partagée par les deux feuilles de l'écran (« … » d'une conversation et FAB) : elles ne
   * peuvent pas être ouvertes en même temps, chacune étant un `Modal`.
   *
   * ⚠️ Ces actions présentent toutes un écran (une `Alert` native, une navigation). Les
   * lancer au tap revient à présenter par-dessus une feuille encore en cours de fermeture :
   * l'animation se voit mal, et iOS peut laisser un modal fantôme qui capte les touches.
   * Même motif que `AttachmentSheet`, et exactement ce que le prop `onClosed` de
   * `BottomSheet` existe pour permettre.
   */
  const pendingActionRef = useRef<(() => void) | null>(null);
  /**
   * ⚠️ `useThemeColors()` et non la constante `NEXA` du fichier pour les icônes d'en-tête :
   * elles sont posées sur `bg-blue-950` en mode sombre, où `#1E40AF` n'aurait presque aucun
   * contraste. Le hook éclaircit l'accent en sombre, c'est précisément son rôle.
   */
  const colors = useThemeColors();
  const [filter, setFilter] = useState<Filter>('all');
  /**
   * Conversation affichée par la feuille « … », et ouverture de celle-ci.
   *
   * ⚠️ DEUX états et non un seul. La feuille épouse la hauteur de son contenu : si celui-ci
   * dépend de `actionTarget`, le passer à `null` pour fermer le fait disparaître AVANT
   * l'animation — la hauteur tombe à zéro et la feuille s'escamote au lieu de redescendre.
   * C'est ce qui la rendait plus brusque que les autres (celle du FAB rend ses actions sans
   * condition, et glisse donc normalement).
   *
   * La cible n'est donc effacée qu'une fois la feuille DÉMONTÉE (`onClosed`).
   */
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const openActions = (conv: Conversation) => {
    setActionTarget(conv);
    setActionsOpen(true);
  };
  // Recherche (barre toujours visible)
  const [query, setQuery] = useState('');
  const [msgResults, setMsgResults] = useState<SearchMsg[]>([]);
  const [friendResults, setFriendResults] = useState<FriendLite[]>([]);
  const [searching, setSearching] = useState(false);
  const searchReq = useRef(0);
  // L'écouteur socket est monté une seule fois : il lit l'id via une ref, pas via le state.
  const currentUserIdRef = useRef<string | null>(null);
  /** Albums déjà comptés — voir le handler `conversation_updated`. */
  const seenBatchesRef = useRef<Set<string>>(new Set());

  const fetchConversations = async () => {
    try {
      const data = await apiRequest<Conversation[]>('/conversations');
      setConversations(sortConversations(data));
      // Le badge de l'onglet suit la liste : le serveur fait foi à chaque rechargement.
      // Les archives en sont exclues, et un « non lu » posé à la main compte pour un.
      setUnreadCounts(
        Object.fromEntries(
          data
            .filter((c) => !c.archivedAt)
            .map((c) => [c.id, c.unreadCount || (c.manualUnread ? 1 : 0)]),
        ),
      );
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
        /**
         * ⚠️ Un ALBUM ne compte qu'UNE fois. L'envoi de N médias émet N événements (un
         * message ne porte qu'une pièce jointe) alors que le destinataire ne verra qu'une
         * bulle : la pastille montait à N et la liste se réordonnait N fois. On retient le
         * `batchId` déjà vu — même jeton, même unité.
         *
         * Le `Set` n'est jamais purgé : un `batchId` porte l'horodatage de son envoi, il
         * n'est jamais réémis, et l'écran est démonté bien avant que sa taille compte.
         */
        const known = message.batchId && seenBatchesRef.current.has(message.batchId);
        if (message.batchId) seenBatchesRef.current.add(message.batchId);

        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId);
          // Conversation inconnue (créée à l'instant) : on recharge la liste.
          if (idx === -1) {
            fetchConversations();
            return prev;
          }
          const fromMe = message.senderId === currentUserIdRef.current;
          if (!fromMe && !known) bumpUnread(conversationId);
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            messages: [message],
            lastMessageAt: message.createdAt,
            // Mes propres messages ne comptent jamais comme non lus. Si la
            // conversation est ouverte, le chat la remarque lue et le refetch
            // au retour sur cet écran remettra le compteur à zéro.
            unreadCount:
              fromMe || known ? updated[idx].unreadCount : updated[idx].unreadCount + 1,
          };
          return sortConversations(updated);
        });
      },
    );

    socket.on('added_to_group', () => fetchConversations());

    // Reconnexion (retour au premier plan, réseau retrouvé) : les `conversation_updated`
    // émis pendant la coupure sont perdus. `useFocusEffect` ne rejoue pas au retour
    // d'arrière-plan — l'écran n'a jamais perdu le focus — d'où ce rechargement.
    socket.on('connect', () => fetchConversations());

    return () => {
      socket.off('conversation_updated');
      socket.off('added_to_group');
      socket.off('connect');
    };
  }, []);

  const getConvName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name ?? t('chat.group');
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other?.user.name ?? t('chat.unknown');
  };

  const getOtherMember = (conv: Conversation) =>
    conv.members.find((m) => m.userId !== currentUserId);

  // L'aperçu du dernier message vit désormais dans `ConversationRow`, avec le reste du
  // rendu d'une ligne — les archives affichent exactement la même chose.

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

  // Les archives sortent de la liste et de tous ses filtres : elles ont leur propre écran.
  const active = conversations.filter((c) => !c.archivedAt);
  const archived = conversations.filter((c) => c.archivedAt);
  const archivedUnread = archived.reduce((n, c) => n + c.unreadCount, 0);

  const unreadTotal = active.filter((c) => c.unreadCount > 0 || c.manualUnread).length;

  const visible = active.filter((conv) => {
    if (filter === 'unread') return conv.unreadCount > 0 || conv.manualUnread;
    if (filter === 'favorites') return !!conv.favoritedAt;
    if (filter === 'groups') return conv.type === 'group';
    return true;
  });

  // --- Recherche ---
  const trimmed = query.trim();
  const searchActive = trimmed.length > 0;

  // Conversations : filtrées en local sur la liste déjà chargée (nom du contact/groupe).
  const convMatches = searchActive
    ? conversations.filter((c) => getConvName(c).toLowerCase().includes(trimmed.toLowerCase()))
    : [];

  // Messages + amis : côté serveur, débouncés (≥2 caractères).
  useEffect(() => {
    if (trimmed.length < 2) {
      setMsgResults([]);
      setFriendResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++searchReq.current;
    const handle = setTimeout(async () => {
      try {
        const [msgs, friends] = await Promise.all([
          apiRequest<SearchMsg[]>(`/conversations/search-messages?q=${encodeURIComponent(trimmed)}`),
          apiRequest<FriendLite[]>(`/friends?q=${encodeURIComponent(trimmed)}`),
        ]);
        if (id !== searchReq.current) return; // réponse périmée (anti-race)
        setMsgResults(msgs);
        setFriendResults(friends);
      } catch {
        if (id === searchReq.current) {
          setMsgResults([]);
          setFriendResults([]);
        }
      } finally {
        if (id === searchReq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [trimmed]);

  // Nom d'affichage d'une conversation issue d'un résultat de recherche.
  const searchConvName = (conv: SearchMsg['conversation']) => {
    if (conv.type === 'group') return conv.name ?? t('chat.group');
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other?.user.name ?? t('chat.unknown');
  };
  const searchConvAvatar = (conv: SearchMsg['conversation']) =>
    conv.members.find((m) => m.userId !== currentUserId)?.user ?? null;

  // Amis déjà présents dans une conversation directe → on ne les propose pas en « démarrer ».
  const directPeerIds = new Set(
    conversations
      .filter((c) => c.type === 'direct')
      .map((c) => c.members.find((m) => m.userId !== currentUserId)?.userId)
      .filter(Boolean) as string[],
  );
  const friendMatches = friendResults.filter((f) => !directPeerIds.has(f.id));

  const openFriendChat = async (friend: FriendLite) => {
    try {
      const conv = await apiRequest<{ id: string }>('/conversations/direct', {
        method: 'POST',
        body: { targetUserId: friend.id },
      });
      setQuery('');
      router.push({
        pathname: '/chat/[id]' as any,
        params: { id: conv.id, name: friend.name, photo: friend.photoUrl ?? '' },
      });
    } catch {
      // silencieux
    }
  };

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
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0, manualUnread: false } : c)),
    );
    clearUnread(conv.id);
    try {
      await apiRequest(`/conversations/${conv.id}/read`, { method: 'POST' });
    } catch {
      fetchConversations();
    }
  };

  /** Bascule lu / non lu. Le « non lu » posé à la main n'attend aucun message réel. */
  const toggleUnread = async (conv: Conversation) => {
    if (conv.unreadCount > 0 || conv.manualUnread) return markRead(conv);
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, manualUnread: true } : c)),
    );
    bumpUnread(conv.id);
    try {
      await apiRequest(`/conversations/${conv.id}/unread`, { method: 'POST' });
    } catch {
      fetchConversations();
    }
  };

  const toggleArchive = async (conv: Conversation) => {
    const archived = !!conv.archivedAt;
    setConversations((prev) =>
      sortConversations(
        prev.map((c) =>
          c.id === conv.id
            ? {
                ...c,
                archivedAt: archived ? null : new Date().toISOString(),
                // Archiver déclasse : le serveur retire l'épinglage, l'affichage suit.
                pinnedAt: archived ? c.pinnedAt : null,
              }
            : c,
        ),
      ),
    );
    // Une conversation archivée sort des pastilles ; désarchivée, elle y revient.
    if (archived) setConversationUnread(conv.id, conv.unreadCount || (conv.manualUnread ? 1 : 0));
    else clearUnread(conv.id);
    try {
      await apiRequest(`/conversations/${conv.id}/archive`, {
        method: 'PATCH',
        body: { archived: !archived },
      });
    } catch {
      fetchConversations();
    }
  };

  // --- Actions demandées par le client (feuille « … » d'une conversation) ---

  /** Sourdine : mêmes durées que dans le chat, la sentinelle « toujours » comprise. */
  const muteMenu = (conv: Conversation) => {
    const apply = (mutedUntil: string | null) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, mutedUntil } : c)),
      );
      apiRequest(`/conversations/${conv.id}/mute`, { method: 'PATCH', body: { mutedUntil } })
        .catch(() => fetchConversations());
    };
    if (isMuted(conv)) {
      apply(null);
      return;
    }
    Alert.alert(t('details.mute'), undefined, [
      { text: t('mute.8h'), onPress: () => apply(hoursFromNow(8)) },
      { text: t('mute.week'), onPress: () => apply(hoursFromNow(24 * 7)) },
      { text: t('mute.always'), onPress: () => apply(MUTE_FOREVER) },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  /**
   * Infos du contact ou du groupe.
   *
   * ⚠️ Deux écrans distincts : `chat/details` ne traite que les conversations directes
   * (profil, blocage, personnalisation), les groupes ont le leur avec les rôles et les
   * membres. Y envoyer un groupe afficherait un écran vide.
   */
  const openInfo = (conv: Conversation) => {
    if (conv.type === 'group') {
      router.push({ pathname: '/group/[id]' as any, params: { id: conv.id } });
      return;
    }
    const other = getOtherMember(conv);
    router.push({
      pathname: '/chat/details' as any,
      // ⚠️ Exactement les paramètres attendus par l'écran (`conversationId`, `userId`,
      // `name`) : il recharge le profil lui-même, une photo passée ici serait ignorée.
      params: { conversationId: conv.id, userId: other?.userId ?? '', name: getConvName(conv) },
    });
  };

  /**
   * Effacer la discussion : vide l'historique POUR MOI, la conversation reste dans la liste.
   *
   * ⚠️ Réglage LOCAL (horodatage en SecureStore), comme depuis les détails — il ne survit
   * donc pas à une réinstallation. C'est un écart connu, tranché au Mois 5 (voir `todo`) ;
   * on ne l'introduit pas ici, on réutilise le mécanisme existant.
   */
  const clearChat = (conv: Conversation) => {
    Alert.alert(t('details.clear_chat'), t('details.clear_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('details.clear_chat'),
        style: 'destructive',
        onPress: () => {
          setConversationClearedAt(conv.id, Date.now()).catch(() => {});
        },
      },
    ]);
  };

  const blockContact = (conv: Conversation) => {
    const other = getOtherMember(conv);
    if (!other) return;
    Alert.alert(t('moderation.block_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () =>
          apiRequest('/blocks', { method: 'POST', body: { userId: other.userId } })
            .then(() => fetchConversations())
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);
  };

  /**
   * Supprimer la discussion : elle quitte MA liste et son historique m'est masqué.
   *
   * ⚠️ Côté SERVEUR (`DELETE /conversations/:id`), contrairement à « Effacer » : une
   * conversation qui réapparaît après une réinstallation serait lue comme un bug, là où des
   * messages qui reviennent passent pour une resynchronisation.
   * ⚠️ Rien n'est supprimé chez l'autre participant, et la conversation REMONTE s'il écrit
   * ensuite — c'est le comportement WhatsApp.
   */
  const deleteConversation = (conv: Conversation) => {
    Alert.alert(t('conv_actions.delete'), t('conv_actions.delete_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('conv_actions.delete'),
        style: 'destructive',
        onPress: () => {
          // Optimiste : elle disparaît tout de suite, le serveur confirme derrière.
          setConversations((prev) => prev.filter((c) => c.id !== conv.id));
          clearUnread(conv.id);
          apiRequest(`/conversations/${conv.id}`, { method: 'DELETE' })
            .catch(() => fetchConversations());
        },
      },
    ]);
  };

  const openChat = (conv: Conversation) => {
    // Remise à zéro immédiate : le chat marque la conversation lue à l'ouverture.
    if (conv.unreadCount > 0) {
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
      );
      clearUnread(conv.id);
    }
    router.push({
      pathname: '/chat/[id]' as any,
      params: {
        id: conv.id,
        name: getConvName(conv),
        // Déjà connus ici : les passer évite à l'en-tête du chat d'afficher l'initiale
        // avant de basculer sur la photo une fois le profil chargé.
        photo: (conv.type === 'group' ? conv.photoUrl : getOtherMember(conv)?.user.photoUrl) ?? '',
        type: conv.type,
      },
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
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <View className="flex-row items-center justify-between px-4 py-4">
        <Text className="text-4xl font-bold text-nexa">{t('messages')}</Text>

        {/* Raccourcis d'en-tête : capture, puis « + ». */}
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            accessibilityLabel={t('media.camera')}
            className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center"
            activeOpacity={0.8}
            onPress={() => router.push('/capture' as any)}
          >
            <Ionicons name="camera-outline" size={22} color={colors.nexa} />
          </TouchableOpacity>

          {/* ⚠️ Ouvre la MÊME feuille que le FAB, et ne double pas ses actions : deux
              chemins vers un même choix, pas deux choix différents selon l'endroit
              où l'on a appuyé. */}
          <TouchableOpacity
            accessibilityLabel={t('fab.new_chat')}
            className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center"
            activeOpacity={0.8}
            onPress={() => setFabOpen(true)}
          >
            <Ionicons name="add" size={24} color={colors.nexa} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Barre de recherche — toujours visible. */}
      <View className="px-4 pb-3">
        <View style={ROUND.inner} className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3">
          <Ionicons name="search" size={18} color="#6B7280" />
          <TextInput
            className="flex-1 py-2.5 px-2 text-lg text-gray-900 dark:text-zinc-100"
            placeholder={t('search.placeholder')}
            placeholderTextColor="#6B7280"
            value={query}
            onChangeText={setQuery}
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

      {searchActive ? (
        <SearchResults
          searching={searching}
          convMatches={convMatches}
          msgResults={msgResults}
          friendMatches={friendMatches}
          getConvName={getConvName}
          getOtherMember={getOtherMember}
          searchConvName={searchConvName}
          searchConvAvatar={searchConvAvatar}
          formatDate={formatDate}
          onOpenConv={openChat}
          onOpenMessage={(m) => {
            /**
             * Ouvre la conversation SUR le message trouvé (item B2).
             *
             * ⚠️ Le relais passe par la mémoire (`chatNav`) et non par un paramètre de route :
             * un paramètre identique ne redéclencherait rien au deuxième passage sur le même
             * message, et c'est justement ce qu'on fait en parcourant des résultats.
             *
             * Le fil sait désormais atteindre une cible absente de sa mémoire — il charge une
             * fenêtre centrée dessus. C'est ce qui manquait pour livrer cet item.
             */
            requestScrollToMessage(m.conversationId, m.id);
            router.push({
              pathname: '/chat/[id]' as any,
              params: { id: m.conversationId, name: searchConvName(m.conversation) },
            });
          }}
          onOpenFriend={openFriendChat}
          t={t}
        />
      ) : (
      <>
      {/* Filtres façon WhatsApp. Le bouton « ajouter un filtre » reste à faire. */}
      <View className="flex-row px-4 pb-3">
        {FILTERS.map((f) => {
          const active = filter === f;
          const badge = f === 'unread' && unreadTotal > 0 ? unreadTotal : null;
          return (
            <TouchableOpacity
              key={f}
              className={`flex-row items-center rounded-full px-4 py-2 mr-2 ${
                active ? 'bg-nexa' : 'bg-gray-100 dark:bg-zinc-800'
              }`}
              onPress={() => setFilter(f)}
            >
              <Text
                className={`text-base font-semibold ${active ? 'text-white' : 'text-gray-600 dark:text-zinc-300'}`}
              >
                {t(`filters.${f}`)}
              </Text>
              {badge !== null && (
                <Text
                  className={`text-base font-bold ml-1 ${active ? 'text-white' : 'text-nexa'}`}
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
            {/* Les stories ont migré vers l'onglet Actus (updates.tsx). */}
            {filter === 'all' && requestCount > 0 && (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800"
                onPress={() => router.push('/requests' as any)}
              >
                <View className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center mr-3.5">
                  <Ionicons name="mail-unread-outline" size={26} color={NEXA} />
                </View>
                <Text className="flex-1 font-semibold text-gray-900 dark:text-zinc-100">
                  {t('message_requests.title')}
                </Text>
                <View className="bg-red-500 rounded-full min-w-[24px] h-[24px] items-center justify-center px-1.5">
                  <Text className="text-white text-sm font-bold">{requestCount}</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Entrée « Archivées » — seulement s'il y a quelque chose dedans, et seulement
                sur « Toutes » : les filtres portent sur la liste visible, pas sur ce qui en
                est rangé. Le compteur de non-lus reste ici, puisqu'il ne compte plus dans la
                pastille de l'onglet. */}
            {filter === 'all' && archived.length > 0 && (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800"
                onPress={() => router.push('/archived' as any)}
              >
                <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-zinc-800 items-center justify-center mr-3.5">
                  <Ionicons name="archive" size={24} color="#6B7280" />
                </View>
                <Text className="flex-1 font-semibold text-gray-900 dark:text-zinc-100">
                  {t('archived.title')}
                </Text>
                {archivedUnread > 0 ? (
                  <Text className="text-nexa font-semibold mr-1">{archivedUnread}</Text>
                ) : (
                  <Text className="text-gray-400 dark:text-zinc-500 mr-1">{archived.length}</Text>
                )}
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
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
            }}
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center mt-20 px-8">
            <Text className="text-gray-400 dark:text-zinc-500 text-center">
              {filter === 'all' ? t('chat.no_conversations') : t(`filters.empty_${filter}`)}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ConversationSwipe
            // Glissé vers la droite : ce qui touche à l'état de lecture et au rangement en tête.
            left={[
              {
                key: 'unread',
                icon: item.unreadCount > 0 || item.manualUnread ? 'mail-open' : 'mail-unread',
                label: t(
                  item.unreadCount > 0 || item.manualUnread
                    ? 'conv_actions.mark_read'
                    : 'conv_actions.mark_unread',
                ),
                color: '#2563EB',
                onPress: () => toggleUnread(item),
              },
              {
                key: 'pin',
                icon: 'pin',
                label: t(item.pinnedAt ? 'conv_actions.unpin' : 'conv_actions.pin'),
                color: '#64748B',
                onPress: () => toggleFlag(item, 'pinnedAt'),
              },
            ]}
            // Glissé vers la gauche : ranger, ou ouvrir le reste des actions.
            right={[
              {
                key: 'archive',
                icon: 'archive',
                label: t('conv_actions.archive'),
                color: NEXA,
                onPress: () => toggleArchive(item),
              },
              {
                key: 'more',
                icon: 'ellipsis-horizontal',
                label: t('conv_actions.more'),
                color: '#475569',
                onPress: () => openActions(item),
              },
            ]}
          >
            <ConversationRow
              conv={item}
              currentUserId={currentUserId}
              onPress={() => openChat(item)}
              onLongPress={() => openActions(item)}
            />
          </ConversationSwipe>
        )}
      />
      </>
      )}

      {/* FAB « + » — remplace l'ancienne icône « nouveau groupe » du header. */}
      <TouchableOpacity
        className="absolute right-5 w-14 h-14 rounded-full bg-nexa items-center justify-center"
        style={[FAB_SHADOW, { bottom: FAB_BOTTOM }]}
        activeOpacity={0.85}
        onPress={() => setFabOpen(true)}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      {/* ⚠️ Même différé que la feuille « … » : ces actions NAVIGUENT, et pousser un écran
          pendant que la feuille se referme superpose deux transitions. */}
      <BottomSheet
        visible={fabOpen}
        onClose={() => setFabOpen(false)}
        onClosed={() => {
          const run = pendingActionRef.current;
          pendingActionRef.current = null;
          if (run) requestAnimationFrame(run);
        }}
      >
        <View className="pb-6 pt-2">
          {FAB_ACTIONS.map(({ key, icon, run }) => (
            <TouchableOpacity
              key={key}
              className="flex-row items-center px-5 py-4"
              onPress={() => {
                pendingActionRef.current = () => run(router);
                setFabOpen(false);
              }}
            >
              <View className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center mr-4">
                <Ionicons name={icon} size={22} color={NEXA} />
              </View>
              <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{t(`fab.${key}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Actions sur une conversation (appui long). */}
      <BottomSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onClosed={() => {
          // La cible n'est lâchée qu'ici : elle a servi à rendre le contenu pendant toute
          // l'animation de fermeture.
          setActionTarget(null);
          const run = pendingActionRef.current;
          pendingActionRef.current = null;
          if (!run) return;
          // Une frame de marge : le Modal vient d'être démonté côté React, iOS termine son
          // retrait au run loop suivant.
          requestAnimationFrame(run);
        }}
      >
        <View className="pb-6 pt-2">
          {actionTarget && (
            <>
              <Text className="px-5 pb-2 text-base text-gray-400 dark:text-zinc-500" numberOfLines={1}>
                {getConvName(actionTarget)}
              </Text>
              <ConvAction
                icon="pin"
                label={t(actionTarget.pinnedAt ? 'conv_actions.unpin' : 'conv_actions.pin')}
                onPress={() => {
                  toggleFlag(actionTarget, 'pinnedAt');
                  setActionsOpen(false);
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
                  setActionsOpen(false);
                }}
              />
              <ConvAction
                icon="archive"
                label={t(
                  actionTarget.archivedAt ? 'conv_actions.unarchive' : 'conv_actions.archive',
                )}
                onPress={() => {
                  toggleArchive(actionTarget);
                  setActionsOpen(false);
                }}
              />
              {actionTarget.unreadCount > 0 && (
                <ConvAction
                  icon="checkmark-done"
                  label={t('conv_actions.mark_read')}
                  onPress={() => {
                    markRead(actionTarget);
                    setActionsOpen(false);
                  }}
                />
              )}

              {/* Actions demandées par le client. Séparées d'un filet : les précédentes
                  rangent la conversation, celles-ci la modifient ou la quittent. */}
              <View className="h-px bg-gray-100 dark:bg-zinc-800 mx-5 my-2" />

              <ConvAction
                icon={isMuted(actionTarget) ? 'notifications' : 'notifications-off'}
                label={t(isMuted(actionTarget) ? 'conv_actions.unmute' : 'conv_actions.mute')}
                onPress={() => {
                  const target = actionTarget;
                  pendingActionRef.current = () => muteMenu(target);
                  setActionsOpen(false);
                }}
              />
              <ConvAction
                icon="information-circle"
                label={t(
                  actionTarget.type === 'group'
                    ? 'conv_actions.info_group'
                    : 'conv_actions.info_contact',
                )}
                onPress={() => {
                  const target = actionTarget;
                  pendingActionRef.current = () => openInfo(target);
                  setActionsOpen(false);
                }}
              />
              <ConvAction
                icon="brush"
                label={t('conv_actions.clear')}
                onPress={() => {
                  const target = actionTarget;
                  pendingActionRef.current = () => clearChat(target);
                  setActionsOpen(false);
                }}
              />
              {/* ⚠️ Bloquer n'a de sens qu'en conversation DIRECTE : on ne bloque pas un
                  groupe, et il n'y aurait pas d'utilisateur à désigner au serveur. */}
              {actionTarget.type === 'direct' && (
                <ConvAction
                  icon="ban"
                  danger
                  label={t('moderation.block')}
                  onPress={() => {
                    const target = actionTarget;
                    pendingActionRef.current = () => blockContact(target);
                    setActionsOpen(false);
                  }}
                />
              )}
              <ConvAction
                icon="trash"
                danger
                label={t('conv_actions.delete')}
                onPress={() => {
                  const target = actionTarget;
                  pendingActionRef.current = () => deleteConversation(target);
                  setActionsOpen(false);
                }}
              />
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
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Action destructrice (bloquer, supprimer) : rouge, comme partout ailleurs dans l'app. */
  danger?: boolean;
}) {
  return (
    <TouchableOpacity className="flex-row items-center px-5 py-4" onPress={onPress}>
      <View
        className={`w-11 h-11 rounded-full items-center justify-center mr-4 ${
          danger ? 'bg-red-50 dark:bg-red-950' : 'bg-blue-50 dark:bg-blue-950'
        }`}
      >
        <Ionicons name={icon} size={22} color={danger ? '#DC2626' : NEXA} />
      </View>
      <Text
        className={`text-lg font-semibold ${
          danger ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-zinc-100'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-sm font-semibold text-gray-400 dark:text-zinc-500 uppercase px-4 pt-4 pb-1">{children}</Text>
  );
}

function SearchResults({
  searching,
  convMatches,
  msgResults,
  friendMatches,
  getConvName,
  getOtherMember,
  searchConvName,
  searchConvAvatar,
  formatDate,
  onOpenConv,
  onOpenMessage,
  onOpenFriend,
  t,
}: {
  searching: boolean;
  convMatches: Conversation[];
  msgResults: SearchMsg[];
  friendMatches: FriendLite[];
  getConvName: (c: Conversation) => string;
  getOtherMember: (c: Conversation) => Conversation['members'][number] | undefined;
  searchConvName: (c: SearchMsg['conversation']) => string;
  searchConvAvatar: (c: SearchMsg['conversation']) => { name: string; photoUrl: string | null } | null;
  formatDate: (iso: string) => string;
  onOpenConv: (c: Conversation) => void;
  onOpenMessage: (m: SearchMsg) => void;
  onOpenFriend: (f: FriendLite) => void;
  t: (k: string) => string;
}) {
  const nothing = convMatches.length === 0 && msgResults.length === 0 && friendMatches.length === 0;

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {/* Conversations (local) */}
      {convMatches.length > 0 && (
        <>
          <SectionTitle>{t('search.conversations')}</SectionTitle>
          {convMatches.map((c) => {
            const other = getOtherMember(c);
            return (
              <TouchableOpacity
                key={c.id}
                className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
                onPress={() => onOpenConv(c)}
              >
                {c.type === 'group' ? (
                  <UserAvatar photoUrl={c.photoUrl} size={48} group />
                ) : (
                  <UserAvatar photoUrl={other?.user.photoUrl} name={other?.user.name} size={48} />
                )}
                <Text className="flex-1 ml-3 font-semibold text-gray-900 dark:text-zinc-100" numberOfLines={1}>
                  {getConvName(c)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* Messages (backend) */}
      {msgResults.length > 0 && (
        <>
          <SectionTitle>{t('search.messages')}</SectionTitle>
          {msgResults.map((m) => {
            const avatar = m.conversation.type === 'group' ? null : searchConvAvatar(m.conversation);
            return (
              <TouchableOpacity
                key={m.id}
                className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
                onPress={() => onOpenMessage(m)}
              >
                {m.conversation.type === 'group' ? (
                  <UserAvatar photoUrl={m.conversation.photoUrl} size={48} group />
                ) : (
                  <UserAvatar photoUrl={avatar?.photoUrl} name={avatar?.name} size={48} />
                )}
                <View className="flex-1 ml-3">
                  <Text className="font-semibold text-gray-900 dark:text-zinc-100" numberOfLines={1}>
                    {searchConvName(m.conversation)}
                  </Text>
                  <Text className="text-base text-gray-500 dark:text-zinc-400" numberOfLines={1}>
                    {m.content}
                  </Text>
                </View>
                <Text className="text-sm text-gray-400 dark:text-zinc-500 ml-2">{formatDate(m.createdAt)}</Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* Amis — démarrer une discussion */}
      {friendMatches.length > 0 && (
        <>
          <SectionTitle>{t('search.friends')}</SectionTitle>
          {friendMatches.map((f) => (
            <TouchableOpacity
              key={f.id}
              className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
              onPress={() => onOpenFriend(f)}
            >
              <UserAvatar photoUrl={f.photoUrl} name={f.name} size={48} />
              <Text className="flex-1 ml-3 font-semibold text-gray-900 dark:text-zinc-100" numberOfLines={1}>
                {f.name}
              </Text>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={NEXA} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {searching && nothing ? (
        <View className="items-center mt-10">
          <ActivityIndicator color={NEXA} />
        </View>
      ) : null}
      {!searching && nothing ? (
        <View className="items-center mt-16 px-10">
          <Ionicons name="search-outline" size={44} color="#D1D5DB" />
          <Text className="text-gray-400 dark:text-zinc-500 text-center mt-3">{t('search.no_results')}</Text>
        </View>
      ) : null}
      <View className="h-24" />
    </ScrollView>
  );
}
