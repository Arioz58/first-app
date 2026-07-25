import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../../components/BottomSheet';
import ChatWallpaperPicker from '../../components/ChatWallpaperPicker';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { requestScrollToMessage } from '../../lib/chatNav';
import {
  BUBBLE_COLORS,
  DEFAULT_BUBBLE_COLOR,
  resolveBubbleColor,
} from '../../lib/bubbleColors';
import type { ChatWallpaper } from '../../lib/chatWallpapers';
import {
  getChatWallpaper,
  getConversationCustomization,
  getUserId,
  setChatWallpaper,
  setConversationClearedAt,
  setConversationCustomization,
  type ConversationCustomization,
} from '../../lib/storage';

const NEXA = '#128C7E';
const MUTE_FOREVER = new Date('2999-12-31T00:00:00Z');

// Ombre douce partagée des cartes (iOS + Android).
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

type RelationStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

type ProfileData = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  online: boolean;
  mutualFriendsCount: number;
  relationStatus: RelationStatus;
  requestId: string | null;
  isFriend: boolean;
  isSelf: boolean;
  canMessage: boolean;
  canCall: boolean;
  canFriendRequest: boolean;
};

type PinnedMsg = {
  id: string;
  content: string | null;
  createdAt: string;
  sender: { name: string };
  storyMediaUrl?: string | null;
};

type MediaCounts = {
  images: number;
  videos: number;
  documents: number;
  audio: number;
  gifs: number;
  links: number;
};

// Groupe où je suis admin et où le contact n'est pas encore membre.
type AdminGroup = { id: string; name: string; memberCount: number };

type MiniUser = { id: string; name: string; photoUrl: string | null };

// Membre tel que renvoyé par GET /conversations (select ciblé côté serveur).
type ConvMember = { userId: string; role: string };
type ConvListItem = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  members: ConvMember[];
};

export default function ConversationDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { conversationId, userId, name } = useLocalSearchParams<{
    conversationId: string;
    userId: string;
    name: string;
  }>();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);

  const [custom, setCustom] = useState<ConversationCustomization>({});
  const [wallpaper, setWallpaper] = useState<ChatWallpaper | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorSheet, setColorSheet] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [photoViewer, setPhotoViewer] = useState(false);

  // Ajout à un groupe existant (gated ami)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [adminGroups, setAdminGroups] = useState<AdminGroup[] | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  // Amis en commun (aperçu avatars + liste au tap)
  const [mutualPreview, setMutualPreview] = useState<MiniUser[]>([]);
  const [mutualOpen, setMutualOpen] = useState(false);
  const [mutualList, setMutualList] = useState<MiniUser[] | null>(null);

  // Phase C — mute / éphémère / épinglés / favoris
  const [ephemeralDuration, setEphemeralDuration] = useState<number | null>(null);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [favoritedAt, setFavoritedAt] = useState<string | null>(null);
  const [pins, setPins] = useState<PinnedMsg[]>([]);
  const [starred, setStarred] = useState<PinnedMsg[]>([]);
  const [mediaCounts, setMediaCounts] = useState<MediaCounts>({
    images: 0,
    videos: 0,
    documents: 0,
    audio: 0,
    gifs: 0,
    links: 0,
  });

  // Re-vérification serveur du profil à l'ouverture (jamais que du cache).
  const load = useCallback(async () => {
    try {
      const res = await apiRequest<ProfileData>(`/users/${userId}/profile`);
      setData(res);
      setNotFound(false);
    } catch {
      // 404 possible si on a bloqué le contact → on vérifie la liste de blocages.
      try {
        const blocks = await apiRequest<{ id: string }[]>('/blocks');
        setBlockedByMe(blocks.some((b) => b.id === userId));
      } catch {
        // ignore
      }
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadConvData = useCallback(() => {
    apiRequest<{
      ephemeralDuration: number | null;
      myMutedUntil: string | null;
      myFavoritedAt: string | null;
    }>(`/conversations/${conversationId}`)
      .then((c) => {
        setEphemeralDuration(c.ephemeralDuration);
        setMutedUntil(c.myMutedUntil);
        setFavoritedAt(c.myFavoritedAt);
      })
      .catch(() => {});
    apiRequest<PinnedMsg[]>(`/conversations/${conversationId}/pins`).then(setPins).catch(() => {});
    apiRequest<PinnedMsg[]>(`/conversations/${conversationId}/starred`)
      .then(setStarred)
      .catch(() => {});
    apiRequest<MediaCounts>(`/conversations/${conversationId}/media-counts`)
      .then(setMediaCounts)
      .catch(() => {});
  }, [conversationId]);

  const openMedia = (category: string, sectionTitle: string) => {
    router.push({
      pathname: '/chat/media' as any,
      params: { conversationId, category, title: sectionTitle },
    });
  };

  // --- Actions de groupe (gated ami) ---
  const createGroupWith = () =>
    router.push({
      pathname: '/group/new' as any,
      params: { prefillId: userId, prefillName: data?.name ?? name, prefillPhoto: data?.photoUrl ?? '' },
    });

  // Mes groupes où je suis admin ET où le contact n'est pas déjà membre.
  // Filtré côté client depuis GET /conversations — pas d'endpoint dédié.
  const openAddToGroup = async () => {
    setAddGroupOpen(true);
    if (adminGroups) return; // déjà chargé
    try {
      const convs = await apiRequest<ConvListItem[]>('/conversations');
      const groups = convs
        .filter((c) => c.type === 'group')
        .filter((c) => {
          const iAmAdmin = c.members.some(
            (m) => m.userId === currentUserId && m.role === 'admin',
          );
          const contactAlreadyIn = c.members.some((m) => m.userId === userId);
          return iAmAdmin && !contactAlreadyIn;
        })
        .map((c) => ({ id: c.id, name: c.name ?? '', memberCount: c.members.length }));
      setAdminGroups(groups);
    } catch {
      setAdminGroups([]);
    }
  };

  const addToGroup = async (group: AdminGroup) => {
    setAddingTo(group.id);
    try {
      await apiRequest(`/conversations/${group.id}/members`, {
        method: 'POST',
        body: { memberIds: [userId] },
      });
      setAdminGroups((prev) => (prev ? prev.filter((g) => g.id !== group.id) : prev));
      Alert.alert('', t('details.added_to_group', { group: group.name }));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setAddingTo(null);
    }
  };

  // Aperçu des amis en commun (avatars) — la liste complète est chargée au tap.
  const loadMutualPreview = useCallback(() => {
    if (!userId) return;
    apiRequest<MiniUser[]>(`/users/${userId}/mutual-friends`)
      .then((list) => {
        setMutualPreview(list.slice(0, 3));
        setMutualList(list); // déjà complet : évite un 2e appel à l'ouverture
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (userId) load();
    else setLoading(false);
    getUserId().then(setCurrentUserId);
    getConversationCustomization(conversationId).then(setCustom);
    getChatWallpaper(conversationId).then(setWallpaper);
    loadConvData();
    loadMutualPreview();
  }, [load, userId, conversationId, loadConvData, loadMutualPreview]);

  const displayName = custom.nickname || data?.name || name || '';
  const isMuted = !!mutedUntil && new Date(mutedUntil) > new Date();

  // --- Personnalisation (local) ---
  const applyWallpaper = (w: ChatWallpaper | null) => {
    setWallpaper(w);
    setChatWallpaper(conversationId, w);
  };
  const applyBubbleColor = async (color: string | null) => {
    setColorSheet(false);
    setCustom(await setConversationCustomization(conversationId, { bubbleColor: color }));
  };
  const saveNickname = async () => {
    setNicknameOpen(false);
    setCustom(
      await setConversationCustomization(conversationId, { nickname: nicknameDraft.trim() || null }),
    );
  };

  // --- Couper les notifications ---
  const applyMute = (until: Date | null) => {
    setMutedUntil(until ? until.toISOString() : null);
    apiRequest(`/conversations/${conversationId}/mute`, {
      method: 'PATCH',
      body: { mutedUntil: until ? until.toISOString() : null },
    }).catch(() => {});
  };
  const muteMenu = () => {
    const h = (hours: number) => new Date(Date.now() + hours * 3600 * 1000);
    Alert.alert(t('details.mute'), undefined, [
      { text: t('mute.8h'), onPress: () => applyMute(h(8)) },
      { text: t('mute.week'), onPress: () => applyMute(h(24 * 7)) },
      { text: t('mute.always'), onPress: () => applyMute(MUTE_FOREVER) },
      ...(isMuted ? [{ text: t('mute.unmute'), onPress: () => applyMute(null) }] : []),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  // --- Favori (conversation entière, par membre — même endpoint que la liste) ---
  const isFavorite = !!favoritedAt;
  const toggleFavorite = () => {
    const next = isFavorite ? null : new Date().toISOString();
    setFavoritedAt(next); // optimiste
    apiRequest(`/conversations/${conversationId}/favorite`, {
      method: 'PATCH',
      body: { favorite: !isFavorite },
    }).catch(() => setFavoritedAt(favoritedAt)); // rollback
  };

  // --- Messages éphémères ---
  const applyEphemeral = (duration: number | null) => {
    setEphemeralDuration(duration);
    apiRequest(`/conversations/${conversationId}/ephemeral`, {
      method: 'PATCH',
      body: { duration },
    }).catch(() => {});
  };
  const ephemeralMenu = () => {
    const DAY = 24 * 3600;
    Alert.alert(t('details.ephemeral'), undefined, [
      { text: t('ephemeral.24h'), onPress: () => applyEphemeral(DAY) },
      { text: t('ephemeral.7d'), onPress: () => applyEphemeral(7 * DAY) },
      { text: t('ephemeral.30d'), onPress: () => applyEphemeral(30 * DAY) },
      { text: t('ephemeral.off'), onPress: () => applyEphemeral(null) },
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };
  const ephemeralLabel = () => {
    const DAY = 24 * 3600;
    if (!ephemeralDuration) return t('ephemeral.off');
    if (ephemeralDuration <= DAY) return t('ephemeral.24h');
    if (ephemeralDuration <= 7 * DAY) return t('ephemeral.7d');
    return t('ephemeral.30d');
  };

  // --- Épinglés / Favoris ---
  const goToMessage = (messageId: string) => {
    requestScrollToMessage(conversationId, messageId);
    router.back();
  };
  const unpin = (messageId: string) =>
    apiRequest(`/conversations/${conversationId}/messages/${messageId}/pin`, { method: 'DELETE' })
      .then(loadConvData)
      .catch(() => {});
  const unstar = (messageId: string) =>
    apiRequest(`/conversations/${conversationId}/messages/${messageId}/star`, { method: 'DELETE' })
      .then(loadConvData)
      .catch(() => {});

  // --- Gestion ---
  const clearChat = () => {
    Alert.alert(t('details.clear_chat'), t('details.clear_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('details.clear_chat'),
        style: 'destructive',
        onPress: async () => {
          await setConversationClearedAt(conversationId, Date.now());
          router.back();
        },
      },
    ]);
  };

  const confirmBlock = () => {
    Alert.alert(t('moderation.block_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () =>
          apiRequest('/blocks', { method: 'POST', body: { userId } })
            .then(() => router.back())
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);
  };
  const unblock = () =>
    apiRequest(`/blocks/${userId}`, { method: 'DELETE' })
      .then(() => load())
      .catch((e: any) => Alert.alert(t('error'), e.message));

  const sendReport = (category: string) =>
    apiRequest('/reports', { method: 'POST', body: { userId, category } })
      .then(() => Alert.alert(t('moderation.report_done')))
      .catch((e: any) => Alert.alert(t('error'), e.message));
  const openReport = () => {
    const cats = ['spam', 'impersonation', 'inappropriate', 'other'];
    Alert.alert(t('moderation.report_category'), '', [
      ...cats.map((c) => ({ text: t(`moderation.${c}`), onPress: () => sendReport(c) })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  const comingSoon = () => Alert.alert('', t('details.coming_soon'));

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* En-tête */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900 flex-1">{t('details.title')}</Text>
      </View>

      {loading ? (
        <DetailsSkeleton />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* 2.1 Bloc profil — bannière dégradée + avatar en débord */}
          <View className="bg-white rounded-2xl mx-4 mt-3 overflow-hidden" style={CARD_SHADOW}>
            <LinearGradient
              colors={['#17A793', '#0E7A6C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ height: 76 }}
            />
            <View className="items-center -mt-11 pb-6 px-6">
              <TouchableOpacity
                disabled={!data?.photoUrl}
                onPress={() => setPhotoViewer(true)}
                activeOpacity={0.9}
              >
                {/* Anneau blanc + point de présence */}
                <View className="rounded-full bg-white p-1">
                  <UserAvatar photoUrl={data?.photoUrl ?? null} name={displayName} size={96} />
                </View>
                {data && !data.isSelf && data.online ? (
                  <View
                    className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white"
                  />
                ) : null}
              </TouchableOpacity>

              <Text className="text-2xl font-bold text-gray-900 mt-3">{displayName}</Text>
              {custom.nickname ? (
                <Text className="text-gray-400 text-sm mt-0.5">{data?.name ?? name}</Text>
              ) : null}

              {data && !data.isSelf ? <RelationBadge status={data.relationStatus} t={t} /> : null}

              {data?.bio ? (
                <Text className="text-gray-600 text-center mt-3">{data.bio}</Text>
              ) : null}
              {data?.phone ? (
                <View className="flex-row items-center mt-2">
                  <Ionicons name="call-outline" size={13} color="#9CA3AF" />
                  <Text className="text-gray-500 ml-1.5">{data.phone}</Text>
                </View>
              ) : null}
              {data && !data.isSelf && !data.online && data.lastSeenAt ? (
                <Text className="text-gray-400 text-xs mt-1">
                  {t('details.last_seen', { value: formatLastSeen(data.lastSeenAt) })}
                </Text>
              ) : null}
              {data && data.mutualFriendsCount > 0 ? (
                <TouchableOpacity
                  onPress={() => setMutualOpen(true)}
                  className="flex-row items-center mt-3 bg-emerald-50 rounded-full pl-1.5 pr-3 py-1"
                >
                  {/* Avatars empilés des amis en commun */}
                  {mutualPreview.length > 0 ? (
                    <View className="flex-row mr-1.5">
                      {mutualPreview.map((f, i) => (
                        <View
                          key={f.id}
                          style={{ marginLeft: i === 0 ? 0 : -8 }}
                          className="rounded-full border border-emerald-50"
                        >
                          <UserAvatar photoUrl={f.photoUrl} name={f.name} size={20} />
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Ionicons name="people" size={13} color={NEXA} style={{ marginRight: 6 }} />
                  )}
                  <Text className="text-nexa text-xs font-medium">
                    {t(
                      data.mutualFriendsCount === 1
                        ? 'profile_view.mutual_one'
                        : 'profile_view.mutual_other',
                      { count: data.mutualFriendsCount },
                    )}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color={NEXA} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* 2.2 Actions rapides — tuiles */}
          {data && !data.isSelf ? (
            <View
              className="flex-row justify-around bg-white rounded-2xl mx-4 mt-3 py-4"
              style={CARD_SHADOW}
            >
              <QuickAction
                icon="call"
                label={t('details.call_audio')}
                disabled={!data.canCall}
                onPress={() =>
                  Alert.alert('', data.canCall ? t('details.calls_coming') : t('details.call_unavailable'))
                }
              />
              <QuickAction
                icon="videocam"
                label={t('details.call_video')}
                disabled={!data.canCall}
                onPress={() =>
                  Alert.alert('', data.canCall ? t('details.calls_coming') : t('details.call_unavailable'))
                }
              />
              <QuickAction
                icon={isFavorite ? 'star' : 'star-outline'}
                label={t('details.favorite')}
                active={isFavorite}
                onPress={toggleFavorite}
              />
              <QuickAction
                icon={isMuted ? 'notifications-off' : 'notifications-outline'}
                label={t('details.mute')}
                active={isMuted}
                onPress={muteMenu}
              />
              <QuickAction icon="search" label={t('details.search')} onPress={comingSoon} />
            </View>
          ) : null}

          {/* 2.3 Personnalisation */}
          <Section title={t('details.customization')}>
            <Row icon="image" label={t('chat.wallpaper')} onPress={() => setPickerOpen(true)} />
            <Row
              icon="pricetag"
              label={t('details.nickname')}
              value={custom.nickname || t('details.nickname_placeholder')}
              onPress={() => {
                setNicknameDraft(custom.nickname || '');
                setNicknameOpen(true);
              }}
            />
            <Row
              icon="color-palette"
              label={t('details.bubble_color')}
              right={
                <View
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: resolveBubbleColor(custom.bubbleColor) }}
                />
              }
              onPress={() => setColorSheet(true)}
            />
            <Row
              icon="timer"
              label={t('details.ephemeral')}
              value={ephemeralLabel()}
              onPress={ephemeralMenu}
            />
          </Section>

          {/* 2.35 Groupes — gated ami */}
          {data && !data.isSelf && data.isFriend ? (
            <Section title={t('details.groups')}>
              <Row
                icon="people"
                label={t('details.create_group_with', { name: data.name })}
                onPress={createGroupWith}
              />
              <Row
                icon="person-add"
                label={t('details.add_to_group')}
                onPress={openAddToGroup}
              />
            </Section>
          ) : null}

          {/* 2.4 Médias, liens et documents — tuiles */}
          <Section title={t('details.media')}>
            <View className="flex-row flex-wrap px-3 pt-1 pb-3">
              {(
                [
                  ['images', 'section_media', 'media', mediaCounts.images + mediaCounts.videos],
                  ['link', 'section_links', 'links', mediaCounts.links],
                  ['document-text', 'section_docs', 'documents', mediaCounts.documents],
                  ['musical-notes', 'section_audio', 'audio', mediaCounts.audio],
                  ['happy', 'section_gifs', 'gifs', mediaCounts.gifs],
                ] as const
              ).map(([icon, key, category, count]) => (
                <TouchableOpacity
                  key={category}
                  className="items-center py-3 rounded-xl"
                  style={{ width: '33.33%' }}
                  onPress={() => openMedia(category, t(`details.${key}`))}
                  activeOpacity={0.7}
                >
                  <View className="w-12 h-12 rounded-2xl bg-emerald-50 items-center justify-center">
                    <Ionicons name={icon} size={22} color={NEXA} />
                  </View>
                  <Text className="text-gray-900 font-semibold mt-1.5">{count}</Text>
                  <Text className="text-gray-400 text-[11px]" numberOfLines={1}>
                    {t(`details.${key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* 2.5 Messages épinglés */}
          <Section title={`${t('details.pinned')} · ${pins.length}`}>
            {pins.length === 0 ? (
              <Text className="text-gray-400 text-sm px-4 py-4">{t('details.no_pinned')}</Text>
            ) : (
              pins.map((m) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  icon="pin"
                  onPress={() => goToMessage(m.id)}
                  onRemove={() => unpin(m.id)}
                />
              ))
            )}
          </Section>

          {/* 2.6 Messages favoris */}
          <Section title={`${t('details.starred')} · ${starred.length}`}>
            {starred.length === 0 ? (
              <Text className="text-gray-400 text-sm px-4 py-4">{t('details.no_starred')}</Text>
            ) : (
              starred.map((m) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  icon="star"
                  iconColor="#F59E0B"
                  onPress={() => goToMessage(m.id)}
                  onRemove={() => unstar(m.id)}
                />
              ))
            )}
          </Section>

          {/* 2.7 Gestion */}
          <Section title={t('details.management')}>
            <Row icon="trash" label={t('details.clear_chat')} danger onPress={clearChat} />
            {data && !data.isSelf ? (
              blockedByMe ? (
                <Row icon="lock-open" label={t('moderation.unblock')} onPress={unblock} />
              ) : (
                <Row icon="ban" label={t('moderation.block')} danger onPress={confirmBlock} />
              )
            ) : null}
            {data && !data.isSelf ? (
              <Row icon="flag" label={t('moderation.report')} danger onPress={openReport} />
            ) : null}
          </Section>

          {notFound && !blockedByMe ? (
            <Text className="text-gray-400 text-center text-xs mt-4 px-8">
              {t('profile_view.not_found')}
            </Text>
          ) : null}
        </ScrollView>
      )}

      {/* Sélecteurs */}
      <ChatWallpaperPicker
        visible={pickerOpen}
        current={wallpaper}
        onClose={() => setPickerOpen(false)}
        onSelect={applyWallpaper}
      />

      <BottomSheet visible={colorSheet} onClose={() => setColorSheet(false)}>
        <View className="px-5 pb-10 pt-1">
          <Text className="text-lg font-bold text-gray-900 mb-1">{t('details.bubble_color')}</Text>
          <Text className="text-sm text-gray-500 mb-4">{t('details.nickname_hint')}</Text>
          <View className="flex-row flex-wrap gap-4">
            {BUBBLE_COLORS.map((c) => {
              const active = resolveBubbleColor(custom.bubbleColor) === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => applyBubbleColor(c === DEFAULT_BUBBLE_COLOR ? null : c)}
                  className="items-center justify-center"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: c,
                    borderWidth: active ? 3 : 0,
                    borderColor: '#111827',
                  }}
                >
                  {active ? <Ionicons name="checkmark" size={20} color="white" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </BottomSheet>

      {/* Surnom */}
      <Modal visible={nicknameOpen} transparent animationType="fade" onRequestClose={() => setNicknameOpen(false)}>
        <Pressable className="flex-1 bg-black/40 justify-center px-8" onPress={() => setNicknameOpen(false)}>
          <Pressable className="bg-white rounded-2xl p-5" onPress={() => Keyboard.dismiss()}>
            <Text className="text-lg font-bold text-gray-900">{t('details.nickname')}</Text>
            <Text className="text-sm text-gray-500 mt-1 mb-3">{t('details.nickname_hint')}</Text>
            <TextInput
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder={t('details.nickname_placeholder')}
              autoFocus
              maxLength={40}
              className="border border-gray-200 rounded-xl px-4 py-3 text-base"
            />
            <View className="flex-row justify-end gap-3 mt-4">
              <TouchableOpacity onPress={() => setNicknameOpen(false)} className="px-4 py-2">
                <Text className="text-gray-500 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveNickname} className="px-4 py-2 bg-nexa rounded-full">
                <Text className="text-white font-semibold">{t('details.save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Amis en commun */}
      <BottomSheet visible={mutualOpen} onClose={() => setMutualOpen(false)}>
        <View className="px-5 pb-8 pt-1">
          <Text className="text-lg font-bold text-gray-900 mb-3">
            {t('details.mutual_friends')}
          </Text>
          {mutualList === null ? (
            <ActivityIndicator color={NEXA} className="my-6" />
          ) : (
            mutualList.map((f) => (
              <TouchableOpacity
                key={f.id}
                className="flex-row items-center py-3"
                onPress={() => {
                  setMutualOpen(false);
                  router.push({ pathname: '/user/[id]' as any, params: { id: f.id } });
                }}
              >
                <UserAvatar photoUrl={f.photoUrl} name={f.name} size={44} />
                <Text className="ml-3 flex-1 text-base font-medium text-gray-900" numberOfLines={1}>
                  {f.name}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </BottomSheet>

      {/* Ajouter à un groupe */}
      <BottomSheet visible={addGroupOpen} onClose={() => setAddGroupOpen(false)}>
        <View className="px-5 pb-8 pt-1">
          <Text className="text-lg font-bold text-gray-900 mb-3">{t('details.add_to_group')}</Text>
          {adminGroups === null ? (
            <ActivityIndicator color={NEXA} className="my-6" />
          ) : adminGroups.length === 0 ? (
            <Text className="text-gray-400 text-sm py-6 text-center">
              {t('details.no_admin_group')}
            </Text>
          ) : (
            adminGroups.map((g) => (
              <TouchableOpacity
                key={g.id}
                className="flex-row items-center py-3"
                onPress={() => addToGroup(g)}
                disabled={!!addingTo}
              >
                <View className="w-11 h-11 rounded-full bg-emerald-50 items-center justify-center mr-3">
                  <Ionicons name="people" size={20} color={NEXA} />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold" numberOfLines={1}>
                    {g.name || t('chat.group')}
                  </Text>
                  <Text className="text-gray-400 text-xs">
                    {t('details.member_count', { count: g.memberCount })}
                  </Text>
                </View>
                {addingTo === g.id ? (
                  <ActivityIndicator size="small" color={NEXA} />
                ) : (
                  <Ionicons name="add-circle-outline" size={22} color={NEXA} />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </BottomSheet>

      {/* Photo plein écran */}
      <Modal visible={photoViewer} transparent animationType="fade" onRequestClose={() => setPhotoViewer(false)}>
        <Pressable className="flex-1 bg-black items-center justify-center" onPress={() => setPhotoViewer(false)}>
          {data?.photoUrl ? (
            <Image source={{ uri: data.photoUrl }} style={{ width: '100%', height: '80%' }} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Date « Vu le JJ/MM à HH:MM ».
function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function RelationBadge({ status, t }: { status: RelationStatus; t: (k: string) => string }) {
  const accent = status === 'friends' || status === 'request_received';
  const label =
    status === 'friends'
      ? t('relation.friends')
      : status === 'request_sent'
        ? t('relation.cancel_request')
        : status === 'request_received'
          ? t('relation.accept')
          : t('relation.add_friend');
  return (
    <View className={`mt-3 px-3 py-1 rounded-full ${accent ? 'bg-emerald-50' : 'bg-gray-100'}`}>
      <Text className={`text-xs font-semibold ${accent ? 'text-nexa' : 'text-gray-600'}`}>
        {label}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <TouchableOpacity className="items-center" onPress={onPress} style={{ opacity: disabled ? 0.4 : 1 }}>
      <View
        className={`w-12 h-12 rounded-2xl items-center justify-center ${active ? 'bg-nexa' : 'bg-emerald-50'}`}
      >
        <Ionicons name={icon} size={22} color={active ? 'white' : NEXA} />
      </View>
      <Text className="text-[11px] text-gray-600 mt-1.5">{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="text-xs font-semibold text-gray-400 uppercase px-6 pb-2">{title}</Text>
      <View className="bg-white rounded-2xl mx-4 overflow-hidden" style={CARD_SHADOW}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  right,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-gray-50"
      onPress={onPress}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <View
        className={`w-9 h-9 rounded-full items-center justify-center ${danger ? 'bg-red-50' : 'bg-emerald-50'}`}
      >
        <Ionicons name={icon} size={18} color={danger ? '#EF4444' : NEXA} />
      </View>
      <Text className={`flex-1 ml-3.5 ${danger ? 'text-red-500' : 'text-gray-800'}`}>{label}</Text>
      {right ?? (value ? <Text className="text-gray-400 text-sm" numberOfLines={1}>{value}</Text> : null)}
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

function MessageRow({
  msg,
  icon,
  iconColor = '#6B7280',
  onPress,
  onRemove,
}: {
  msg: PinnedMsg;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress: () => void;
  onRemove: () => void;
}) {
  const preview = msg.content?.trim() || (msg.storyMediaUrl ? '📷' : '…');
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-gray-50">
      <Ionicons name={icon} size={18} color={iconColor} />
      <TouchableOpacity className="flex-1 ml-3" onPress={onPress} activeOpacity={0.7}>
        <Text className="text-gray-800" numberOfLines={1}>
          {preview}
        </Text>
        <Text className="text-gray-400 text-xs mt-0.5">{msg.sender?.name}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} className="p-1 ml-2">
        <Ionicons name="close" size={18} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );
}

function DetailsSkeleton() {
  return (
    <View>
      <View className="items-center bg-white rounded-2xl mx-4 mt-3 pt-8 pb-6" style={CARD_SHADOW}>
        <View style={{ width: 96, height: 96 }} className="rounded-full bg-gray-200" />
        <View className="w-40 h-5 bg-gray-200 rounded mt-4" />
        <View className="w-24 h-3 bg-gray-100 rounded mt-3" />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} className="mt-5 bg-white rounded-2xl mx-4 px-4 py-4" style={CARD_SHADOW}>
          <View className="w-32 h-3 bg-gray-100 rounded mb-4" />
          <View className="w-full h-4 bg-gray-100 rounded mb-3" />
          <View className="w-3/4 h-4 bg-gray-100 rounded" />
        </View>
      ))}
      <ActivityIndicator color={NEXA} className="mt-6" />
    </View>
  );
}
