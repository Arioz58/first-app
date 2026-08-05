import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../../components/BottomSheet';
import QrCode from '../../components/QrCode';
import { apiRequest } from '../../lib/api';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../../lib/i18n';
import { clearTokens } from '../../lib/storage';
import { unregisterPushToken } from '../../lib/notifications';
import { disconnectSocket } from '../../lib/socket';
import { requestContactsSegment } from '../../lib/tabsNav';
import { setUnreadCounts } from '../../lib/unreadMessages';
import {
  clearCity,
  detectAndSaveCity,
  formatLocation,
  type ProfileLocation,
} from '../../lib/location';
import { stopAllLiveShares } from '../../lib/liveLocation';
import { getThemePref, setThemePref, useThemeColors, type ThemePref } from '../../lib/theme';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

type User = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  privacyConsent: boolean;
  language: string;
  profile: {
    bio: string | null;
    city?: string | null;
    country?: string | null;
    locationEnabled?: boolean;
  } | null;
};
type Stats = { friends: number; groups: number; stories: number };

// --- Sous-composants ---
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      {title ? (
        <Text className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase px-6 pb-2">
          {title}
        </Text>
      ) : null}
      <View className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 overflow-hidden" style={CARD_SHADOW}>
        {children}
      </View>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const c = useThemeColors();
  return (
    <TouchableOpacity
      className={`flex-row items-center px-4 py-3.5 ${last ? '' : 'border-b border-gray-50 dark:border-zinc-800'}`}
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
        className={`ml-3.5 flex-1 text-lg ${danger ? 'text-red-500 font-semibold' : 'text-gray-900 dark:text-zinc-100'}`}
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [myLocation, setMyLocation] = useState<ProfileLocation | null>(null);
  const [locating, setLocating] = useState(false);

  const [langVisible, setLangVisible] = useState(false);
  const [themeVisible, setThemeVisible] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [themePref, setThemePrefState] = useState<ThemePref>('system');

  useEffect(() => {
    apiRequest<User>('/users/me')
      .then((me) => {
        setUser(me);
        if (me.profile?.city) {
          setMyLocation({ city: me.profile.city, country: me.profile.country ?? null });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiRequest<Stats>('/users/me/stats').then(setStats).catch(() => {});
    getThemePref().then(setThemePrefState);
  }, []);

  /**
   * Relève la ville, ou propose de la retirer si elle est déjà renseignée.
   *
   * Volontairement manuel : la position n'est lue qu'au moment où l'utilisateur le demande,
   * jamais en tâche de fond.
   */
  const handleLocation = () => {
    const detect = async () => {
      setLocating(true);
      const result = await detectAndSaveCity();
      setLocating(false);
      if (result.ok) return setMyLocation(result.location);

      // Refus définitif : le dialogue système ne reviendra plus, seul un détour par les
      // réglages débloque la situation — autant y emmener l'utilisateur.
      if (result.reason === 'denied' && !result.canAskAgain) {
        return Alert.alert(t('location.error_title'), t('location.denied'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('location.open_settings'), onPress: () => Linking.openSettings() },
        ]);
      }
      Alert.alert(
        t('location.error_title'),
        t(result.reason === 'denied' ? 'location.denied' : 'location.unavailable'),
      );
    };

    if (!myLocation) return detect();
    Alert.alert(formatLocation(myLocation), '', [
      { text: t('location.refresh'), onPress: detect },
      {
        text: t('location.remove'),
        style: 'destructive',
        onPress: () => {
          setMyLocation(null);
          clearCity().catch(() => {});
        },
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('logout_confirm_title'), t('logout_confirm_message'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          // Avant d'effacer la session : la requête a besoin du jeton d'accès, et
          // l'appareil ne doit plus recevoir les notifications de ce compte.
          await unregisterPushToken();
          // Aucun partage de position ne doit survivre au changement de compte. Attendu :
          // l'arrêt prévient le serveur et coupe le suivi, deux choses qui ont besoin de la
          // session encore valide.
          await stopAllLiveShares();
          // Les non-lus du compte quitté ne doivent pas rester sur l'icône de l'app.
          setUnreadCounts({});
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
      const { uploadUrl, publicUrl } = await apiRequest<{ uploadUrl: string; publicUrl: string }>(
        '/upload/presigned-url',
        { method: 'POST', body: { contentType: 'image/jpeg' } },
      );
      const blob = await fetch(asset.uri).then((r) => r.blob());
      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!up.ok) throw new Error('upload');
      await apiRequest('/users/me', { method: 'PATCH', body: { photoUrl: publicUrl } });
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
      await apiRequest('/users/me', { method: 'PATCH', body: { photoUrl: null } });
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
    if (!trimmed) return setNameError(t('name_required'));
    if (trimmed.length < 2) return setNameError(t('name_too_short'));
    const bio = bioDraft.trim();
    setSavingName(true);
    try {
      await apiRequest('/users/me', { method: 'PATCH', body: { name: trimmed, bio } });
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

  const shareProfile = () => {
    if (!user) return;
    Share.share({ message: t('share.message', { name: user.name, phone: user.phone }) }).catch(
      () => {},
    );
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
  // Lien deep link avec le scheme de l'app (nexa://user/<id> en build) →
  // scannable in-app ET par l'appareil photo natif, routé par expo-router.
  const profileValue = user ? ExpoLinking.createURL(`/user/${user.id}`) : '';

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* En-tête bannière */}
        <View className="bg-white dark:bg-zinc-900 rounded-2xl mx-4 mt-3 overflow-hidden" style={CARD_SHADOW}>
          <LinearGradient
            colors={['#3B82F6', '#1E3A8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ height: 84 }}
          >
            {/* Actions coin haut-droit : QR + partager */}
            <View className="flex-row justify-end px-3 pt-3 gap-2">
              <TouchableOpacity
                className="w-9 h-9 rounded-full bg-white/20 items-center justify-center"
                onPress={() => setQrVisible(true)}
              >
                <Ionicons name="qr-code" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                className="w-9 h-9 rounded-full bg-white/20 items-center justify-center"
                onPress={shareProfile}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View className="items-center -mt-12 pb-5 px-6">
            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.85} disabled={uploading}>
              <View className="rounded-full bg-white dark:bg-zinc-900 p-1">
                <View className="w-24 h-24 rounded-full overflow-hidden items-center justify-center bg-blue-50 dark:bg-blue-950">
                  {user?.photoUrl ? (
                    <Image source={{ uri: user.photoUrl }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Text className="text-5xl font-bold" style={{ color: c.nexa }}>
                      {user?.name?.charAt(0).toUpperCase() ?? '?'}
                    </Text>
                  )}
                  {uploading && (
                    <View className="absolute inset-0 items-center justify-center bg-black/40">
                      <ActivityIndicator color="white" />
                    </View>
                  )}
                </View>
              </View>
              <View
                className="absolute bottom-1 right-1 w-8 h-8 rounded-full items-center justify-center border-2 border-white dark:border-zinc-900"
                style={{ backgroundColor: c.nexa }}
              >
                <Ionicons name="camera" size={15} color="white" />
              </View>
            </TouchableOpacity>

            <View className="flex-row items-center mt-3">
              <Text className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{user?.name}</Text>
              <TouchableOpacity className="ml-2 p-1" onPress={openEditModal}>
                <Ionicons name="pencil" size={16} color={c.nexa} />
              </TouchableOpacity>
            </View>
            <Text className="text-gray-500 dark:text-zinc-400 mt-0.5">{user?.phone}</Text>
            {user?.profile?.bio ? (
              <Text className="text-gray-600 dark:text-zinc-300 text-center mt-2">{user.profile.bio}</Text>
            ) : (
              <TouchableOpacity onPress={openEditModal}>
                <Text className="text-nexa dark:text-blue-400 text-sm mt-2">{t('add_bio')}</Text>
              </TouchableOpacity>
            )}

            {/* Stats */}
            <View className="flex-row mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 w-full">
              <StatItem
                value={stats?.friends ?? 0}
                label={t('profile_stats.friends')}
                onPress={() => {
                  requestContactsSegment('friends');
                  router.navigate('/(tabs)/search' as any);
                }}
              />
              <StatItem value={stats?.groups ?? 0} label={t('profile_stats.groups')} onPress={() => router.navigate('/(tabs)' as any)} />
              <StatItem value={stats?.stories ?? 0} label={t('profile_stats.stories')} onPress={() => router.navigate('/(tabs)/updates' as any)} />
            </View>
          </View>
        </View>

        {/* Préférences */}
        <Section title={t('sections.preferences')}>
          <SettingRow icon="contrast-outline" label={t('theme.appearance')} value={themeLabel} onPress={() => setThemeVisible(true)} />
          <SettingRow
            icon="language-outline"
            label={t('language')}
            value={currentLang ? `${currentLang.flag} ${currentLang.label}` : ''}
            onPress={() => setLangVisible(true)}
            last
          />
        </Section>

        {/* Confidentialité */}
        <Section title={t('sections.privacy')}>
          {/* La ville ne s'affiche sur le profil que si le partage est activé dans les
              réglages de confidentialité — d'où sa place ici, juste à côté d'eux. */}
          <SettingRow
            icon="location-outline"
            label={t('location.row')}
            value={locating ? t('location.detecting') : formatLocation(myLocation) || t('location.none')}
            onPress={handleLocation}
          />
          <SettingRow icon="lock-closed-outline" label={t('privacy_settings.title')} onPress={() => router.push('/privacy' as any)} />
          <SettingRow icon="ban-outline" label={t('blocked_title')} onPress={() => router.push('/blocked' as any)} />
          <SettingRow
            icon="shield-checkmark-outline"
            label={t('privacy_title')}
            value={user?.privacyConsent ? t('consent_granted') : t('consent_not_granted')}
            last
          />
        </Section>

        {/* À propos */}
        <Section title={t('sections.about')}>
          <SettingRow icon="information-circle-outline" label={t('about.version')} value={APP_VERSION} last />
        </Section>

        {/* Déconnexion */}
        <Section>
          <SettingRow icon="log-out-outline" label={t('logout')} onPress={handleLogout} danger last />
        </Section>
      </ScrollView>

      {/* Modal édition (nom + bio) */}
      <Modal visible={editModal} transparent animationType="fade">
        <Pressable className="flex-1 justify-center items-center bg-black/40 px-8" onPress={() => setEditModal(false)}>
          <Pressable className="w-full bg-white dark:bg-zinc-900 rounded-2xl p-5" onPress={() => Keyboard.dismiss()}>
            <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-3">{t('edit_profile')}</Text>
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
            {nameError ? <Text className="text-red-500 text-base mt-1 ml-1">{nameError}</Text> : null}
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
            <Text className="text-gray-400 dark:text-zinc-500 text-sm mt-1 ml-1 self-end">{bioDraft.length}/140</Text>
            <View className="flex-row justify-end gap-3 mt-2">
              <TouchableOpacity className="px-4 py-2" onPress={() => setEditModal(false)}>
                <Text className="text-gray-500 dark:text-zinc-400 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity className="px-5 py-2 rounded-full" style={{ backgroundColor: c.nexa }} onPress={saveProfile} disabled={savingName}>
                {savingName ? <ActivityIndicator color="white" size="small" /> : <Text className="text-white font-semibold">{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Drawer langue */}
      <BottomSheet visible={langVisible} onClose={() => setLangVisible(false)}>
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 px-5 pt-1 pb-2">{t('language')}</Text>
        {SUPPORTED_LANGUAGES.map((l) => {
          const active = l.code === user?.language;
          return (
            <TouchableOpacity key={l.code} className="flex-row items-center px-5 py-4" onPress={() => selectLanguage(l.code)}>
              <Text className="text-3xl mr-3">{l.flag}</Text>
              <Text className={`flex-1 text-lg ${active ? 'font-bold' : 'text-gray-900 dark:text-zinc-100'}`} style={active ? { color: c.nexa } : undefined}>
                {l.label}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={c.nexa} />}
            </TouchableOpacity>
          );
        })}
        <View className="pb-8" />
      </BottomSheet>

      {/* Drawer thème */}
      <BottomSheet visible={themeVisible} onClose={() => setThemeVisible(false)}>
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 px-5 pt-1 pb-2">{t('theme.appearance')}</Text>
        {(
          [
            ['system', 'phone-portrait-outline'],
            ['light', 'sunny-outline'],
            ['dark', 'moon-outline'],
          ] as const
        ).map(([pref, icon]) => {
          const active = themePref === pref;
          return (
            <TouchableOpacity key={pref} className="flex-row items-center px-5 py-4" onPress={() => selectTheme(pref)}>
              <Ionicons name={icon} size={22} color={active ? c.nexa : c.muted} style={{ marginRight: 12 }} />
              <Text className={`flex-1 text-lg ${active ? 'font-bold' : 'text-gray-900 dark:text-zinc-100'}`} style={active ? { color: c.nexa } : undefined}>
                {t(`theme.${pref}`)}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={c.nexa} />}
            </TouchableOpacity>
          );
        })}
        <View className="pb-8" />
      </BottomSheet>

      {/* Drawer QR code */}
      <BottomSheet visible={qrVisible} onClose={() => setQrVisible(false)}>
        <View className="items-center px-6 pt-2 pb-8">
          <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-1">{t('share.qr_title')}</Text>
          <Text className="text-gray-500 dark:text-zinc-400 text-sm mb-5 text-center">{t('share.qr_hint')}</Text>
          <View className="p-4 bg-white rounded-3xl" style={CARD_SHADOW}>
            <QrCode value={profileValue} size={220} />
          </View>
          <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mt-4">{user?.name}</Text>
          <TouchableOpacity className="flex-row items-center bg-nexa rounded-full px-5 py-2.5 mt-4" onPress={shareProfile}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text className="text-white font-semibold ml-2">{t('share.button')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function StatItem({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity className="flex-1 items-center" onPress={onPress} disabled={!onPress}>
      <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100">{value}</Text>
      <Text className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{label}</Text>
    </TouchableOpacity>
  );
}
