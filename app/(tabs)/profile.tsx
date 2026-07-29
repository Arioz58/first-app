import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../../components/BottomSheet';
import { apiRequest } from '../../lib/api';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../../lib/i18n';
import { clearTokens } from '../../lib/storage';
import { disconnectSocket } from '../../lib/socket';
import { getThemePref, setThemePref, useThemeColors, type ThemePref } from '../../lib/theme';

type User = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  privacyConsent: boolean;
  language: string;
  profile: { bio: string | null } | null;
};

// Ligne de réglage générique (icône + label + valeur/flèche)
function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const c = useThemeColors();
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-4"
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
    >
      <View
        className={`w-9 h-9 rounded-full items-center justify-center ${danger ? 'bg-red-50 dark:bg-red-950' : 'bg-blue-50 dark:bg-blue-950'}`}
      >
        <Ionicons name={icon} size={20} color={danger ? '#EF4444' : c.nexa} />
      </View>
      <Text
        className={`ml-3 flex-1 text-lg ${danger ? 'text-red-500 font-semibold' : 'text-gray-900 dark:text-zinc-100'}`}
      >
        {label}
      </Text>
      {value ? <Text className="text-gray-400 dark:text-zinc-500 mr-1">{value}</Text> : null}
      {onPress && !danger ? <Ionicons name="chevron-forward" size={18} color={c.faint} /> : null}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const c = useThemeColors();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [langVisible, setLangVisible] = useState(false);
  const [themeVisible, setThemeVisible] = useState(false);
  const [themePref, setThemePrefState] = useState<ThemePref>('system');

  useEffect(() => {
    apiRequest<User>('/users/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
    getThemePref().then(setThemePrefState);
  }, []);

  const handleLogout = () => {
    Alert.alert(t('logout_confirm_title'), t('logout_confirm_message'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          disconnectSocket();
          await clearTokens();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const handleChangePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await apiRequest<{
        uploadUrl: string;
        publicUrl: string;
      }>('/upload/presigned-url', {
        method: 'POST',
        body: { contentType: 'image/jpeg' },
      });

      const blob = await fetch(asset.uri).then((r) => r.blob());
      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!up.ok) throw new Error('upload');

      await apiRequest('/users/me', {
        method: 'PATCH',
        body: { photoUrl: publicUrl },
      });
      setUser((u) => (u ? { ...u, photoUrl: publicUrl } : u));
    } catch {
      Alert.alert(t('error'), t('photo_error'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    try {
      await apiRequest('/users/me', {
        method: 'PATCH',
        body: { photoUrl: null },
      });
      setUser((u) => (u ? { ...u, photoUrl: null } : u));
    } catch {
      Alert.alert(t('error'), t('photo_error'));
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarPress = () => {
    if (!user?.photoUrl) {
      handleChangePhoto();
      return;
    }
    Alert.alert('', '', [
      { text: t('change_photo'), onPress: handleChangePhoto },
      { text: t('remove_photo'), style: 'destructive', onPress: handleRemovePhoto },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const openEditModal = () => {
    setNameDraft(user?.name ?? '');
    setBioDraft(user?.profile?.bio ?? '');
    setNameError('');
    setEditModal(true);
  };

  const saveProfile = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError(t('name_required'));
      return;
    }
    if (trimmed.length < 2) {
      setNameError(t('name_too_short'));
      return;
    }
    const bio = bioDraft.trim();
    setSavingName(true);
    try {
      await apiRequest('/users/me', {
        method: 'PATCH',
        body: { name: trimmed, bio },
      });
      setUser((u) => (u ? { ...u, name: trimmed, profile: { ...u.profile, bio } } : u));
      setEditModal(false);
    } catch (e: any) {
      setNameError(e.message || t('error'));
    } finally {
      setSavingName(false);
    }
  };

  const selectLanguage = async (code: string) => {
    setLangVisible(false);
    if (code === user?.language) return;
    await setAppLanguage(code);
    setUser((u) => (u ? { ...u, language: code } : u));
    apiRequest('/users/me', { method: 'PATCH', body: { language: code } }).catch(() => {});
  };

  const selectTheme = async (pref: ThemePref) => {
    setThemeVisible(false);
    setThemePrefState(pref);
    await setThemePref(pref);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-950">
        <ActivityIndicator size="large" color={c.nexa} />
      </View>
    );
  }

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === user?.language);
  const themeLabel =
    themePref === 'light' ? t('theme.light') : themePref === 'dark' ? t('theme.dark') : t('theme.system');

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <View className="px-5 py-3 bg-white dark:bg-zinc-900">
        <Text className="text-3xl font-bold" style={{ color: c.nexa }}>
          {t('profile')}
        </Text>
      </View>

      {/* Carte profil */}
      <View className="items-center bg-white dark:bg-zinc-900 pt-6 pb-8 mb-3">
        <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} disabled={uploading}>
          <View className="w-28 h-28 rounded-full overflow-hidden items-center justify-center bg-blue-50 dark:bg-blue-950">
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text className="text-6xl font-bold" style={{ color: c.nexa }}>
                {user?.name?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            )}
            {uploading && (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color="white" />
              </View>
            )}
          </View>
          <View
            className="absolute bottom-0 right-0 w-9 h-9 rounded-full items-center justify-center border-2 border-white dark:border-zinc-900"
            style={{ backgroundColor: c.nexa }}
          >
            <Ionicons name="camera" size={18} color="white" />
          </View>
        </TouchableOpacity>

        <View className="flex-row items-center mt-4">
          <Text className="text-3xl font-bold text-gray-900 dark:text-zinc-100">{user?.name}</Text>
          <TouchableOpacity className="ml-2 p-1" onPress={openEditModal}>
            <Ionicons name="pencil" size={18} color={c.nexa} />
          </TouchableOpacity>
        </View>
        <Text className="text-gray-500 dark:text-zinc-400 mt-1">{user?.phone}</Text>

        <TouchableOpacity onPress={openEditModal} className="mt-2 px-8">
          {user?.profile?.bio ? (
            <Text className="text-gray-600 dark:text-zinc-300 text-center">{user.profile.bio}</Text>
          ) : (
            <Text className="text-gray-400 dark:text-zinc-500 italic text-center">{t('add_bio')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Réglages */}
      <View className="bg-white dark:bg-zinc-900">
        <Text className="px-4 pt-4 pb-1 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
          {t('settings')}
        </Text>
        <SettingRow
          icon="contrast-outline"
          label={t('theme.appearance')}
          value={themeLabel}
          onPress={() => setThemeVisible(true)}
        />
        <View className="h-px bg-gray-100 dark:bg-zinc-800 ml-16" />
        <SettingRow
          icon="language-outline"
          label={t('language')}
          value={currentLang ? `${currentLang.flag} ${currentLang.label}` : ''}
          onPress={() => setLangVisible(true)}
        />
        <View className="h-px bg-gray-100 dark:bg-zinc-800 ml-16" />
        <SettingRow
          icon="lock-closed-outline"
          label={t('privacy_settings.title')}
          onPress={() => router.push('/privacy' as any)}
        />
        <View className="h-px bg-gray-100 dark:bg-zinc-800 ml-16" />
        <SettingRow
          icon="shield-checkmark-outline"
          label={t('privacy_title')}
          value={user?.privacyConsent ? t('consent_granted') : t('consent_not_granted')}
        />
      </View>

      <View className="bg-white dark:bg-zinc-900 mt-3">
        <SettingRow icon="log-out-outline" label={t('logout')} onPress={handleLogout} danger />
      </View>

      {/* Modal édition du profil (nom + bio) */}
      <Modal visible={editModal} transparent animationType="fade">
        <Pressable
          className="flex-1 justify-center items-center bg-black/40 px-8"
          onPress={() => setEditModal(false)}
        >
          <Pressable className="w-full bg-white dark:bg-zinc-900 rounded-2xl p-5" onPress={() => Keyboard.dismiss()}>
            <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-3">
              {t('edit_profile')}
            </Text>
            <TextInput
              className={`border rounded-xl px-4 py-3 text-xl text-gray-900 dark:text-zinc-100 ${nameError ? 'border-red-400' : 'border-gray-300 dark:border-zinc-700'}`}
              placeholder={t('your_name')}
              placeholderTextColor={c.faint}
              value={nameDraft}
              onChangeText={(v) => {
                setNameDraft(v);
                setNameError('');
              }}
              autoFocus
              maxLength={40}
            />
            {nameError ? (
              <Text className="text-red-500 text-base mt-1 ml-1">{nameError}</Text>
            ) : null}

            <TextInput
              className="border border-gray-300 dark:border-zinc-700 rounded-xl px-4 py-3 text-lg text-gray-900 dark:text-zinc-100 mt-3 h-24"
              placeholder={t('bio_placeholder')}
              placeholderTextColor={c.faint}
              value={bioDraft}
              onChangeText={setBioDraft}
              multiline
              textAlignVertical="top"
              maxLength={140}
            />
            <Text className="text-gray-400 dark:text-zinc-500 text-sm mt-1 ml-1 self-end">
              {bioDraft.length}/140
            </Text>

            <View className="flex-row justify-end gap-3 mt-2">
              <TouchableOpacity className="px-4 py-2" onPress={() => setEditModal(false)}>
                <Text className="text-gray-500 dark:text-zinc-400 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-5 py-2 rounded-full"
                style={{ backgroundColor: c.nexa }}
                onPress={saveProfile}
                disabled={savingName}
              >
                {savingName ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white font-semibold">{t('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Drawer sélection de langue */}
      <BottomSheet visible={langVisible} onClose={() => setLangVisible(false)}>
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 px-5 pt-1 pb-2">
          {t('language')}
        </Text>
        {SUPPORTED_LANGUAGES.map((l) => {
          const active = l.code === user?.language;
          return (
            <TouchableOpacity
              key={l.code}
              className="flex-row items-center px-5 py-4"
              onPress={() => selectLanguage(l.code)}
            >
              <Text className="text-3xl mr-3">{l.flag}</Text>
              <Text
                className={`flex-1 text-lg ${active ? 'font-bold' : 'text-gray-900 dark:text-zinc-100'}`}
                style={active ? { color: c.nexa } : undefined}
              >
                {l.label}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={c.nexa} />}
            </TouchableOpacity>
          );
        })}
        <View className="pb-8" />
      </BottomSheet>

      {/* Drawer sélection du thème */}
      <BottomSheet visible={themeVisible} onClose={() => setThemeVisible(false)}>
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 px-5 pt-1 pb-2">
          {t('theme.appearance')}
        </Text>
        {(
          [
            ['system', 'phone-portrait-outline'],
            ['light', 'sunny-outline'],
            ['dark', 'moon-outline'],
          ] as const
        ).map(([pref, icon]) => {
          const active = themePref === pref;
          return (
            <TouchableOpacity
              key={pref}
              className="flex-row items-center px-5 py-4"
              onPress={() => selectTheme(pref)}
            >
              <Ionicons name={icon} size={22} color={active ? c.nexa : c.muted} style={{ marginRight: 12 }} />
              <Text
                className={`flex-1 text-lg ${active ? 'font-bold' : 'text-gray-900 dark:text-zinc-100'}`}
                style={active ? { color: c.nexa } : undefined}
              >
                {t(`theme.${pref}`)}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={c.nexa} />}
            </TouchableOpacity>
          );
        })}
        <View className="pb-8" />
      </BottomSheet>
    </SafeAreaView>
  );
}
