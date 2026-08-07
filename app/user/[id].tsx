import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { formatLocation } from '../../lib/location';

type RelationStatus =
  | 'self'
  | 'friends'
  | 'request_sent'
  | 'request_received'
  | 'none';

type ProfileData = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  location: { city: string; country: string | null } | null; // gated (locationEnabled + privacyLocation)
  mutualFriendsCount: number;
  relationStatus: RelationStatus;
  requestId: string | null;
  isFriend: boolean;
  isSelf: boolean;
  canMessage: boolean;
  canCall: boolean;
  canFriendRequest: boolean;
};

const NEXA = '#1E40AF';

export default function UserProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Clé de l'action en cours, ou `null`. Une clé et non un booléen : plusieurs boutons
  // coexistent (accepter/refuser, ou ami/message), et un drapeau global les ferait tous
  // s'animer alors qu'un seul a été touché.
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<ProfileData>(`/users/${id}/profile`);
      setData(res);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    if (acting) return;
    setActing(key);
    try {
      await fn();
      await load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setActing(null);
    }
  };

  const addFriend = () =>
    act('add', () =>
      apiRequest('/friends/requests', { method: 'POST', body: { toUserId: id } }),
    );
  const cancelRequest = () =>
    act('cancel', () => apiRequest(`/friends/requests/${data?.requestId}`, { method: 'DELETE' }));
  const acceptRequest = () =>
    act('accept', () =>
      apiRequest(`/friends/requests/${data?.requestId}/accept`, { method: 'POST' }),
    );
  const refuseRequest = () =>
    act('refuse', () =>
      apiRequest(`/friends/requests/${data?.requestId}/refuse`, { method: 'POST' }),
    );
  const removeFriend = () =>
    Alert.alert(t('friends.remove_title'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('relation.remove_friend'),
        style: 'destructive',
        onPress: () => act('remove', () => apiRequest(`/friends/${id}`, { method: 'DELETE' })),
      },
    ]);

  const sendReport = (category: string) => {
    apiRequest('/reports', { method: 'POST', body: { userId: id, category } })
      .then(() => Alert.alert(t('moderation.report_done')))
      .catch((e: any) => Alert.alert(t('error'), e.message));
  };

  const openReport = () => {
    const cats = ['spam', 'impersonation', 'inappropriate', 'other'];
    Alert.alert(t('moderation.report_category'), '', [
      ...cats.map((c) => ({ text: t(`moderation.${c}`), onPress: () => sendReport(c) })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  const confirmBlock = () => {
    Alert.alert(t('moderation.block_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () =>
          apiRequest('/blocks', { method: 'POST', body: { userId: id } })
            .then(() => router.back())
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);
  };

  const openMenu = () => {
    Alert.alert('', '', [
      { text: t('moderation.block'), style: 'destructive', onPress: confirmBlock },
      { text: t('moderation.report'), onPress: openReport },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const openChat = async () => {
    try {
      const conv = await apiRequest<{ id: string }>('/conversations/direct', {
        method: 'POST',
        body: { targetUserId: id },
      });
      router.push({
        pathname: '/chat/[id]' as any,
        params: { id: conv.id, name: data?.name ?? '', photo: data?.photoUrl ?? '' },
      });
    } catch {
      // silencieux
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100 flex-1" numberOfLines={1}>
          {data?.name ?? ''}
        </Text>
        {data && !data.isSelf && (
          <TouchableOpacity onPress={openMenu} className="ml-2 p-1">
            <Ionicons name="ellipsis-horizontal" size={22} color="#374151" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ProfileSkeleton />
      ) : notFound || !data ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="person-circle-outline" size={56} color="#D1D5DB" />
          <Text className="text-gray-400 dark:text-zinc-500 mt-3">{t('profile_view.not_found')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="items-center pt-8 pb-6">
            <UserAvatar photoUrl={data.photoUrl} name={data.name} size={118} />
            <Text className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mt-4">{data.name}</Text>
            {data.mutualFriendsCount > 0 && (
              <Text className="text-gray-500 dark:text-zinc-400 mt-1">
                {t(
                  data.mutualFriendsCount === 1
                    ? 'profile_view.mutual_one'
                    : 'profile_view.mutual_other',
                  { count: data.mutualFriendsCount },
                )}
              </Text>
            )}
            {data.bio ? (
              <Text className="text-gray-600 dark:text-zinc-300 text-center px-10 mt-3">{data.bio}</Text>
            ) : null}
          </View>

          {/* Actions amitié */}
          {!data.isSelf && (
            <View className="px-5">
              {data.relationStatus === 'request_received' ? (
                <View className="flex-row gap-3">
                  <ActionButton
                    label={t('relation.accept')}
                    onPress={acceptRequest}
                    disabled={!!acting}
                    busy={acting === 'accept'}
                    primary
                    className="flex-1"
                  />
                  <ActionButton
                    label={t('relation.refuse')}
                    onPress={refuseRequest}
                    disabled={!!acting}
                    busy={acting === 'refuse'}
                    className="flex-1"
                  />
                </View>
              ) : data.relationStatus === 'friends' ? (
                <ActionButton
                  label={t('relation.friends')}
                  icon="checkmark"
                  onPress={removeFriend}
                  disabled={!!acting}
                  busy={acting === 'remove'}
                />
              ) : data.relationStatus === 'request_sent' ? (
                <ActionButton
                  label={t('relation.cancel_request')}
                  onPress={cancelRequest}
                  disabled={!!acting}
                  busy={acting === 'cancel'}
                />
              ) : data.canFriendRequest ? (
                <ActionButton
                  label={t('relation.add_friend')}
                  icon="person-add"
                  onPress={addFriend}
                  disabled={!!acting}
                  busy={acting === 'add'}
                  primary
                />
              ) : null}

              {/* Message + appels */}
              <View className="flex-row items-center gap-3 mt-3">
                <ActionButton
                  label={t('profile_view.message')}
                  icon="chatbubble"
                  onPress={openChat}
                  disabled={!data.canMessage}
                  primary={data.canMessage}
                  className="flex-1"
                />
                <View
                  className={`w-12 h-12 rounded-full items-center justify-center ${data.canCall ? 'bg-blue-50 dark:bg-blue-950' : 'bg-gray-100 dark:bg-zinc-800'}`}
                >
                  <Ionicons name="call" size={20} color={data.canCall ? NEXA : '#9CA3AF'} />
                </View>
                <View
                  className={`w-12 h-12 rounded-full items-center justify-center ${data.canCall ? 'bg-blue-50 dark:bg-blue-950' : 'bg-gray-100 dark:bg-zinc-800'}`}
                >
                  <Ionicons name="videocam" size={20} color={data.canCall ? NEXA : '#9CA3AF'} />
                </View>
              </View>
              {!data.canMessage && (
                <Text className="text-gray-400 dark:text-zinc-500 text-sm text-center mt-2">
                  {t('profile_view.message_friends_only')}
                </Text>
              )}
            </View>
          )}

          {/* Infos gated */}
          <View className="mt-6 px-5 gap-3">
            {data.phone ? (
              <InfoRow icon="call-outline" value={data.phone} />
            ) : null}
            {/* Absente si la personne n'a pas activé le partage, ou si sa règle de
                visibilité m'exclut : le serveur ne renvoie alors rien du tout. */}
            {data.location?.city ? (
              <InfoRow icon="location-outline" value={formatLocation(data.location)} />
            ) : null}
            {data.lastSeenAt ? (
              <InfoRow
                icon="time-outline"
                label={t('profile_view.last_seen')}
                value={new Date(data.lastSeenAt).toLocaleString()}
              />
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  busy,
  primary,
  className = '',
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  /** Action en cours SUR CE bouton : le seul à s'animer, les autres sont juste inactifs. */
  busy?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <TouchableOpacity
      className={`flex-row items-center justify-center rounded-full py-3 px-5 ${primary ? 'bg-nexa' : 'border border-gray-300 dark:border-zinc-700'} ${disabled && !busy ? 'opacity-50' : ''} ${className}`}
      onPress={onPress}
      disabled={disabled}
    >
      {/* ⚠️ Contenu gardé en place, seulement rendu invisible : le remplacer par
          l'indicateur changerait la largeur du bouton, et la rangée entière bougerait. On
          ne peut pas non plus figer une largeur, elle dépend du libellé traduit. */}
      <View className="flex-row items-center" style={{ opacity: busy ? 0 : 1 }}>
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={primary ? 'white' : '#374151'}
            style={{ marginRight: 6 }}
          />
        )}
        <Text className={`font-semibold ${primary ? 'text-white' : 'text-gray-700 dark:text-zinc-300'}`}>
          {label}
        </Text>
      </View>
      {busy && (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <ActivityIndicator size="small" color={primary ? 'white' : '#6B7280'} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center">
      <Ionicons name={icon} size={20} color="#6B7280" />
      <View className="ml-3">
        {label ? <Text className="text-gray-400 dark:text-zinc-500 text-sm">{label}</Text> : null}
        <Text className="text-gray-800 dark:text-zinc-200">{value}</Text>
      </View>
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View className="items-center pt-8">
      <View className="w-26 h-26 rounded-full bg-gray-200 dark:bg-zinc-700" style={{ width: 104, height: 104 }} />
      <View className="w-40 h-5 bg-gray-200 dark:bg-zinc-700 rounded mt-4" />
      <View className="w-28 h-3 bg-gray-100 dark:bg-zinc-800 rounded mt-3" />
      <View className="w-11/12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-full mt-8" />
      <View className="w-11/12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-full mt-3" />
      <ActivityIndicator color={NEXA} className="mt-8" />
    </View>
  );
}
