import { Ionicons } from '@expo/vector-icons';
import { permissionDeniedAlert } from '../../lib/permissionAlert';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '../../components/BottomSheet';
import { UserAvatar } from '../../components/UserAvatar';
import { useUserSearch, type SearchUser } from '../../lib/useUserSearch';
import { toUploadableImage } from '../../lib/upload';
import { apiRequest } from '../../lib/api';
import { ROUND } from '../../lib/radius';
import { getUserId } from '../../lib/storage';

const NEXA = '#1E40AF';
const MUTE_FOREVER = new Date('2999-12-31T00:00:00Z');
const SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.85);
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

type Role = 'admin' | 'moderator' | 'member';
type Member = { userId: string; role: Role; user: { id: string; name: string; photoUrl: string | null } };
type GroupData = {
  id: string;
  name: string | null;
  photoUrl: string | null;
  description: string | null;
  whoCanSend: 'all' | 'admins';
  ephemeralDuration: number | null;
  myMutedUntil: string | null;
  myRole: Role;
  members: Member[];
};
type MediaCounts = {
  images: number;
  videos: number;
  documents: number;
  audio: number;
  gifs: number;
  links: number;
};

export default function GroupDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<GroupData | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaCounts, setMediaCounts] = useState<MediaCounts>({
    images: 0,
    videos: 0,
    documents: 0,
    audio: 0,
    gifs: 0,
    links: 0,
  });
  const [uploading, setUploading] = useState(false);

  // Édition nom / description (admin)
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  // Ajout de membres
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { results, loading: searching } = useUserSearch(query);
  const [busy, setBusy] = useState(false);

  // Liste complète des membres (drawer + recherche)
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');

  const MEMBERS_PREVIEW = 6;

  const load = useCallback(() => {
    apiRequest<GroupData>(`/conversations/${id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
    apiRequest<MediaCounts>(`/conversations/${id}/media-counts`).then(setMediaCounts).catch(() => {});
  }, [id]);

  useEffect(() => {
    getUserId().then(setMe);
    load();
  }, [load]);

  const isAdmin = data?.myRole === 'admin';
  const canManage = data?.myRole === 'admin' || data?.myRole === 'moderator';
  const isMuted = !!data?.myMutedUntil && new Date(data.myMutedUntil) > new Date();

  // Membres triés : admins d'abord, puis modérateurs, puis membres.
  const rank: Record<Role, number> = { admin: 0, moderator: 1, member: 2 };
  const members = [...(data?.members ?? [])].sort((a, b) => rank[a.role] - rank[b.role]);

  // --- Édition infos (admin) ---
  const saveInfo = async () => {
    setEditOpen(false);
    const body: Record<string, string> = {};
    if (nameDraft.trim()) body.name = nameDraft.trim();
    body.description = descDraft.trim();
    try {
      await apiRequest(`/conversations/${id}`, { method: 'PATCH', body });
      load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const changePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      // ⚠️ Ne renvoyait rien du tout : le bouton devenait muet, sans que rien n'explique
      // pourquoi la galerie ne s'ouvrait pas.
      permissionDeniedAlert(t('chat.wallpaper'), t('chat.wallpaper_permission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      /**
       * ⚠️ Re-encodée en vrai JPEG : une photo d'iPhone est en HEIC, qu'AUCUN navigateur ne
       * décode. Déclarer `image/jpeg` sans convertir donnait un avatar invisible sur le
       * client web — et un avatar cassé se remarque plus qu'une image de conversation.
       */
      const src = await toUploadableImage(result.assets[0].uri);
      const { uploadUrl, publicUrl } = await apiRequest<{ uploadUrl: string; publicUrl: string }>(
        '/upload/presigned-url',
        { method: 'POST', body: { contentType: src.contentType } },
      );
      const blob = await fetch(src.uri).then((r) => r.blob());
      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': src.contentType },
        body: blob,
      });
      if (!up.ok) throw new Error('upload');
      await apiRequest(`/conversations/${id}`, { method: 'PATCH', body: { photoUrl: publicUrl } });
      load();
    } catch {
      Alert.alert(t('error'), t('photo_error'));
    } finally {
      setUploading(false);
    }
  };

  // --- Membres ---
  const addMembers = async (user: SearchUser) => {
    setBusy(true);
    try {
      await apiRequest(`/conversations/${id}/members`, {
        method: 'POST',
        body: { memberIds: [user.id] },
      });
      setQuery('');
      setAddOpen(false);
      load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const setRole = (target: Member, role: Role) =>
    apiRequest(`/conversations/${id}/members/${target.userId}/role`, { method: 'PATCH', body: { role } })
      .then(load)
      .catch((e: any) => Alert.alert(t('error'), e.message));

  const removeMember = (target: Member) =>
    Alert.alert(t('group.remove_confirm', { name: target.user.name }), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('group.remove'),
        style: 'destructive',
        onPress: () =>
          apiRequest(`/conversations/${id}/members/${target.userId}`, { method: 'DELETE' })
            .then(load)
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);

  const openMemberMenu = (target: Member) => {
    if (target.userId === me) {
      router.push({ pathname: '/user/[id]' as any, params: { id: target.userId } });
      return;
    }
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [
      {
        text: t('group.view_profile'),
        onPress: () => router.push({ pathname: '/user/[id]' as any, params: { id: target.userId } }),
      },
    ];
    if (isAdmin) {
      if (target.role !== 'admin')
        options.push({ text: t('group.make_admin'), onPress: () => setRole(target, 'admin') });
      if (target.role !== 'moderator')
        options.push({ text: t('group.make_moderator'), onPress: () => setRole(target, 'moderator') });
      if (target.role !== 'member')
        options.push({ text: t('group.make_member'), onPress: () => setRole(target, 'member') });
    }
    // admin retire tout le monde ; modérateur tout sauf un admin
    if (isAdmin || (canManage && target.role !== 'admin'))
      options.push({ text: t('group.remove'), style: 'destructive', onPress: () => removeMember(target) });
    options.push({ text: t('cancel'), style: 'cancel' });
    Alert.alert(target.user.name, undefined, options);
  };

  // --- Éphémères / Mute / Paramètre ---
  const applyEphemeral = (duration: number | null) => {
    apiRequest(`/conversations/${id}/ephemeral`, { method: 'PATCH', body: { duration } })
      .then(load)
      .catch(() => {});
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
    const d = data?.ephemeralDuration;
    if (!d) return t('ephemeral.off');
    if (d <= DAY) return t('ephemeral.24h');
    if (d <= 7 * DAY) return t('ephemeral.7d');
    return t('ephemeral.30d');
  };

  const applyMute = (until: Date | null) => {
    apiRequest(`/conversations/${id}/mute`, {
      method: 'PATCH',
      body: { mutedUntil: until ? until.toISOString() : null },
    })
      .then(load)
      .catch(() => {});
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

  const toggleWhoCanSend = () => {
    const next = data?.whoCanSend === 'admins' ? 'all' : 'admins';
    apiRequest(`/conversations/${id}/settings`, { method: 'PATCH', body: { whoCanSend: next } })
      .then(load)
      .catch((e: any) => Alert.alert(t('error'), e.message));
  };

  const openMedia = (category: string, title: string) =>
    router.push({ pathname: '/chat/media' as any, params: { conversationId: id, category, title } });

  const leaveGroup = () =>
    Alert.alert(t('group.leave_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('group.leave'),
        style: 'destructive',
        onPress: () =>
          apiRequest(`/conversations/${id}/leave`, { method: 'POST' })
            .then(() => router.replace('/(tabs)'))
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);

  if (loading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-950 items-center justify-center">
        <ActivityIndicator size="large" color={NEXA} />
      </SafeAreaView>
    );
  }

  const roleBadge = (role: Role) =>
    role === 'admin' ? t('roles.admin') : role === 'moderator' ? t('roles.moderator') : null;

  // Ligne d'un membre (réutilisée dans l'aperçu et le drawer complet).
  const memberRow = (m: Member) => (
    <TouchableOpacity
      key={m.userId}
      className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
      onPress={() => openMemberMenu(m)}
    >
      <UserAvatar photoUrl={m.user.photoUrl} name={m.user.name} size={44} />
      <Text className="flex-1 ml-3 font-semibold text-gray-900 dark:text-zinc-100" numberOfLines={1}>
        {m.user.name}
        {m.userId === me ? ` ${t('group.you')}` : ''}
      </Text>
      {roleBadge(m.role) && (
        <View className={`rounded-full px-2 py-0.5 ${m.role === 'admin' ? 'bg-blue-50 dark:bg-blue-950' : 'bg-gray-100 dark:bg-zinc-800'}`}>
          <Text className={`text-xs font-semibold ${m.role === 'admin' ? 'text-nexa' : 'text-gray-500 dark:text-zinc-400'}`}>
            {roleBadge(m.role)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const memberMatches = members.filter((m) =>
    m.user.name.toLowerCase().includes(memberQuery.trim().toLowerCase()),
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-950">
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 flex-1">{t('group.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* En-tête */}
        <View className="bg-white dark:bg-zinc-900 mx-4 mt-3 overflow-hidden" style={[CARD_SHADOW, ROUND.bubble]}>
          <LinearGradient colors={['#3B82F6', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 76 }} />
          <View className="items-center -mt-11 pb-5 px-6">
            <TouchableOpacity disabled={!isAdmin || uploading} onPress={changePhoto} activeOpacity={0.85}>
              <View className="rounded-full bg-white dark:bg-zinc-900 p-1">
                <UserAvatar photoUrl={data.photoUrl} size={96} group />
              </View>
              {isAdmin && (
                <View className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-nexa items-center justify-center border-2 border-white">
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </View>
              )}
            </TouchableOpacity>

            <View className="flex-row items-center mt-3">
              <Text className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{data.name ?? t('chat.group')}</Text>
              {isAdmin && (
                <TouchableOpacity
                  className="ml-2"
                  onPress={() => {
                    setNameDraft(data.name ?? '');
                    setDescDraft(data.description ?? '');
                    setEditOpen(true);
                  }}
                >
                  <Ionicons name="pencil" size={16} color={NEXA} />
                </TouchableOpacity>
              )}
            </View>
            <Text className="text-gray-400 dark:text-zinc-500 text-sm mt-0.5">
              {t('group.member_count', { count: members.length })}
            </Text>
            {data.description ? (
              <Text className="text-gray-600 dark:text-zinc-300 text-center mt-2">{data.description}</Text>
            ) : isAdmin ? (
              <TouchableOpacity
                onPress={() => {
                  setNameDraft(data.name ?? '');
                  setDescDraft('');
                  setEditOpen(true);
                }}
              >
                <Text className="text-nexa text-sm mt-2">{t('group.add_description')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Actions rapides */}
        <View className="flex-row justify-around bg-white dark:bg-zinc-900 mx-4 mt-3 py-4" style={[CARD_SHADOW, ROUND.bubble]}>
          <QuickAction
            icon={isMuted ? 'notifications-off' : 'notifications-outline'}
            label={t('details.mute')}
            active={isMuted}
            onPress={muteMenu}
          />
          <QuickAction icon="timer" label={t('details.ephemeral')} onPress={ephemeralMenu} />
          {canManage && (
            <QuickAction icon="person-add" label={t('group.add')} onPress={() => setAddOpen(true)} />
          )}
        </View>

        {/* Membres — aperçu des 6 premiers + « voir tout » */}
        <Section title={`${t('group.members')} · ${members.length}`}>
          {members.slice(0, MEMBERS_PREVIEW).map(memberRow)}
          {members.length > MEMBERS_PREVIEW && (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3"
              onPress={() => setMembersOpen(true)}
            >
              <View className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center">
                <Ionicons name="chevron-down" size={20} color={NEXA} />
              </View>
              <Text className="ml-3 font-semibold text-nexa">
                {t('group.show_all', { count: members.length })}
              </Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* Médias */}
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
                className="items-center py-3"
                style={{ width: '33.33%' }}
                onPress={() => openMedia(category, t(`details.${key}`))}
              >
                <View style={ROUND.bubble} className="w-12 h-12 bg-blue-50 dark:bg-blue-950 items-center justify-center">
                  <Ionicons name={icon} size={22} color={NEXA} />
                </View>
                <Text className="text-gray-900 dark:text-zinc-100 font-semibold mt-1.5">{count}</Text>
                <Text className="text-gray-400 dark:text-zinc-500 text-[11px]" numberOfLines={1}>
                  {t(`details.${key}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Paramètres (admin) */}
        {isAdmin && (
          <Section title={t('group.settings')}>
            <Row
              icon="chatbubbles"
              label={t('group.who_can_send')}
              value={data.whoCanSend === 'admins' ? t('group.only_admins') : t('group.everyone')}
              onPress={toggleWhoCanSend}
            />
          </Section>
        )}

        {/* Éphémères en rappel + gestion */}
        <Section title={t('details.management')}>
          <Row icon="timer" label={t('details.ephemeral')} value={ephemeralLabel()} onPress={ephemeralMenu} />
          <Row icon="exit" label={t('group.leave')} danger onPress={leaveGroup} />
        </Section>
      </ScrollView>

      {/* Modale édition nom/description */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable className="flex-1 bg-black/40 justify-center px-8" onPress={() => setEditOpen(false)}>
          <Pressable style={ROUND.bubble} className="bg-white dark:bg-zinc-900 p-5" onPress={() => Keyboard.dismiss()}>
            <Text className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-3">{t('group.edit_info')}</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t('group.group_name')}
              maxLength={50}
              style={ROUND.inner}
              className="border border-gray-200 dark:border-zinc-800 px-4 py-3 text-base mb-3"
            />
            <TextInput
              value={descDraft}
              onChangeText={setDescDraft}
              placeholder={t('group.description_placeholder')}
              maxLength={200}
              multiline
              className="border border-gray-200 dark:border-zinc-800 px-4 py-3 text-base"
              style={{ ...ROUND.inner, minHeight: 70, textAlignVertical: 'top' }}
            />
            <View className="flex-row justify-end gap-3 mt-4">
              <TouchableOpacity onPress={() => setEditOpen(false)} className="px-4 py-2">
                <Text className="text-gray-500 dark:text-zinc-400 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveInfo} className="px-4 py-2 bg-nexa rounded-full">
                <Text className="text-white font-semibold">{t('details.save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Tous les membres — drawer avec recherche */}
      <BottomSheet
        visible={membersOpen}
        onClose={() => {
          setMembersOpen(false);
          setMemberQuery('');
        }}
        height={SHEET_HEIGHT}
      >
        <View className="flex-row items-center px-5 pt-1 pb-2">
          <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 flex-1">
            {t('group.members')} · {members.length}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setMembersOpen(false);
              setMemberQuery('');
            }}
          >
            <Ionicons name="close" size={26} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={ROUND.inner} className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3 mx-4 my-3">
          <Ionicons name="search" size={18} color="#6B7280" />
          <TextInput
            className="flex-1 py-3 px-2 text-base text-gray-900 dark:text-zinc-100"
            placeholder={t('group.search_member')}
            placeholderTextColor="#6B7280"
            value={memberQuery}
            onChangeText={setMemberQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={memberMatches}
          keyExtractor={(item) => item.userId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
          renderItem={({ item }) => memberRow(item)}
          ListEmptyComponent={
            <Text className="text-gray-400 dark:text-zinc-500 text-center mt-8">{t('friends.no_friends')}</Text>
          }
        />
      </BottomSheet>

      {/* Ajout de membres — BottomSheet partagé (même drawer que le reste de l'app) */}
      <BottomSheet
        visible={addOpen}
        onClose={() => {
          setAddOpen(false);
          setQuery('');
        }}
        height={SHEET_HEIGHT}
      >
        <View className="flex-row items-center px-5 pt-1 pb-2">
          <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 flex-1">{t('group.add_members')}</Text>
          <TouchableOpacity
            onPress={() => {
              setAddOpen(false);
              setQuery('');
            }}
          >
            <Ionicons name="close" size={26} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={ROUND.inner} className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3 mx-4 my-3">
          <Ionicons name="search" size={18} color="#6B7280" />
          <TextInput
            className="flex-1 py-3 px-2 text-base text-gray-900 dark:text-zinc-100"
            placeholder={t('user_search.placeholder')}
            placeholderTextColor="#6B7280"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator color={NEXA} size="small" />}
        </View>

        <FlatList
          data={results.filter((u) => !members.some((m) => m.userId === u.id))}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
              disabled={busy}
              onPress={() => addMembers(item)}
            >
              <UserAvatar photoUrl={item.photoUrl} name={item.name} size={44} />
              <Text className="flex-1 ml-3 font-semibold text-gray-900 dark:text-zinc-100">{item.name}</Text>
              <Ionicons name="add-circle-outline" size={22} color={NEXA} />
            </TouchableOpacity>
          )}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity className="items-center" onPress={onPress}>
      <View style={ROUND.bubble} className={`w-12 h-12 items-center justify-center ${active ? 'bg-nexa' : 'bg-blue-50 dark:bg-blue-950'}`}>
        <Ionicons name={icon} size={22} color={active ? 'white' : NEXA} />
      </View>
      <Text className="text-[11px] text-gray-600 dark:text-zinc-300 mt-1.5">{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase px-6 pb-2">{title}</Text>
      <View className="bg-white dark:bg-zinc-900 mx-4 overflow-hidden" style={[CARD_SHADOW, ROUND.bubble]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800" onPress={onPress}>
      <View className={`w-9 h-9 rounded-full items-center justify-center ${danger ? 'bg-red-50' : 'bg-blue-50 dark:bg-blue-950'}`}>
        <Ionicons name={icon} size={18} color={danger ? '#EF4444' : NEXA} />
      </View>
      <Text className={`flex-1 ml-3.5 ${danger ? 'text-red-500' : 'text-gray-800 dark:text-zinc-200'}`}>{label}</Text>
      {value ? <Text className="text-gray-400 dark:text-zinc-500 text-sm" numberOfLines={1}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}
