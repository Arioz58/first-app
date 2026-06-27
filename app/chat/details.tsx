import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
import {
  BUBBLE_COLORS,
  DEFAULT_BUBBLE_COLOR,
  resolveBubbleColor,
} from '../../lib/bubbleColors';
import type { ChatWallpaper } from '../../lib/chatWallpapers';
import {
  getChatWallpaper,
  getConversationCustomization,
  setChatWallpaper,
  setConversationClearedAt,
  setConversationCustomization,
  type ConversationCustomization,
} from '../../lib/storage';

const NEXA = '#128C7E';

type RelationStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

type ProfileData = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  mutualFriendsCount: number;
  relationStatus: RelationStatus;
  requestId: string | null;
  isFriend: boolean;
  isSelf: boolean;
  canMessage: boolean;
  canCall: boolean;
  canFriendRequest: boolean;
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

  useEffect(() => {
    if (userId) load();
    else setLoading(false);
    getConversationCustomization(conversationId).then(setCustom);
    getChatWallpaper(conversationId).then(setWallpaper);
  }, [load, userId, conversationId]);

  const displayName = custom.nickname || data?.name || name || '';

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
          {/* 2.1 Bloc profil */}
          <View className="items-center bg-white pt-8 pb-6 px-6">
            <TouchableOpacity
              disabled={!data?.photoUrl}
              onPress={() => setPhotoViewer(true)}
              activeOpacity={0.9}
            >
              <UserAvatar photoUrl={data?.photoUrl ?? null} name={displayName} size={104} />
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-gray-900 mt-4">{displayName}</Text>
            {custom.nickname ? (
              <Text className="text-gray-400 text-sm mt-0.5">{data?.name ?? name}</Text>
            ) : null}

            {data && !data.isSelf ? <RelationBadge status={data.relationStatus} t={t} /> : null}

            {data?.bio ? (
              <Text className="text-gray-600 text-center mt-3">{data.bio}</Text>
            ) : null}
            {data?.phone ? (
              <Text className="text-gray-500 mt-2">{data.phone}</Text>
            ) : null}
            {data?.lastSeenAt ? (
              <Text className="text-gray-400 text-xs mt-1">
                {t('details.last_seen', { value: formatLastSeen(data.lastSeenAt) })}
              </Text>
            ) : null}
            {data && data.mutualFriendsCount > 0 ? (
              <TouchableOpacity onPress={comingSoon} className="mt-2">
                <Text className="text-nexa text-sm">
                  {t(
                    data.mutualFriendsCount === 1
                      ? 'profile_view.mutual_one'
                      : 'profile_view.mutual_other',
                    { count: data.mutualFriendsCount },
                  )}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* 2.2 Actions rapides */}
          {data && !data.isSelf ? (
            <View className="flex-row justify-around bg-white mt-3 py-4">
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
              <QuickAction icon="notifications-off" label={t('details.mute')} onPress={comingSoon} />
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
              value={t('details.coming_soon')}
              disabled
              onPress={comingSoon}
            />
          </Section>

          {/* 2.4 Médias, liens et documents (placeholders — pas encore de médias dans le chat) */}
          <Section title={t('details.media')}>
            {(
              [
                ['images', 'section_media'],
                ['link', 'section_links'],
                ['document-text', 'section_docs'],
                ['musical-notes', 'section_audio'],
                ['happy', 'section_gifs'],
              ] as const
            ).map(([icon, key]) => (
              <Row
                key={key}
                icon={icon}
                label={`${t(`details.${key}`)} · 0`}
                disabled
                onPress={comingSoon}
              />
            ))}
            <View className="items-center py-6">
              <Ionicons name="images-outline" size={32} color="#D1D5DB" />
              <Text className="text-gray-400 text-sm mt-2">{t('details.empty_media')}</Text>
            </View>
          </Section>

          {/* 2.5 / 2.6 Épinglés & Favoris (placeholders Phase C) */}
          <Section title={t('details.organize')}>
            <Row icon="pin" label={`${t('details.pinned')} · 0`} disabled onPress={comingSoon} />
            <Row icon="star" label={`${t('details.starred')} · 0`} disabled onPress={comingSoon} />
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
          <Pressable className="bg-white rounded-2xl p-5" onPress={(e) => e.stopPropagation()}>
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity className="items-center" onPress={onPress} style={{ opacity: disabled ? 0.4 : 1 }}>
      <View className="w-12 h-12 rounded-full bg-emerald-50 items-center justify-center">
        <Ionicons name={icon} size={22} color={NEXA} />
      </View>
      <Text className="text-[11px] text-gray-600 mt-1">{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-3 bg-white">
      <Text className="text-xs font-semibold text-gray-400 uppercase px-5 pt-4 pb-1">{title}</Text>
      {children}
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
      className="flex-row items-center px-5 py-3.5 border-b border-gray-50"
      onPress={onPress}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Ionicons name={icon} size={20} color={danger ? '#EF4444' : '#6B7280'} />
      <Text className={`flex-1 ml-4 ${danger ? 'text-red-500' : 'text-gray-800'}`}>{label}</Text>
      {right ?? (value ? <Text className="text-gray-400 text-sm" numberOfLines={1}>{value}</Text> : null)}
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

function DetailsSkeleton() {
  return (
    <View>
      <View className="items-center bg-white pt-8 pb-6">
        <View style={{ width: 104, height: 104 }} className="rounded-full bg-gray-200" />
        <View className="w-40 h-5 bg-gray-200 rounded mt-4" />
        <View className="w-24 h-3 bg-gray-100 rounded mt-3" />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} className="mt-3 bg-white px-5 py-4">
          <View className="w-32 h-3 bg-gray-100 rounded mb-4" />
          <View className="w-full h-4 bg-gray-100 rounded mb-3" />
          <View className="w-3/4 h-4 bg-gray-100 rounded" />
        </View>
      ))}
      <ActivityIndicator color={NEXA} className="mt-6" />
    </View>
  );
}
