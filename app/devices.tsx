import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../lib/api';
import { formatDate, formatListDate } from '../lib/callHistory';
import { signOut } from '../lib/signOut';
import { useThemeColors } from '../lib/theme';

type Session = {
  id: string;
  platform: 'ios' | 'android' | 'web' | null;
  deviceModel: string | null;
  osName: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  ios: 'phone-portrait-outline',
  android: 'phone-portrait-outline',
  web: 'laptop-outline',
};

/**
 * APPAREILS CONNECTÉS (29/10) — chaque appareil ouvert sur le compte, et de quoi en fermer un.
 *
 * ⚠️ Deux gestes en bas de liste : « tous les autres » et « tous mes appareils » (celui-ci
 * compris, déplacé ici depuis le profil) — le second reste le geste d'urgence (téléphone volé, on ne sait pas lequel), celui-là sert à retirer UN
 * appareil oublié sans se déconnecter partout. Le serveur retire aussi à l'appareil fermé ses
 * notifications et ses appels (`revokeOneSession`).
 *
 * ⚠️ « Dernière activité » à un quart d'heure près : le serveur ne la note qu'au
 * renouvellement du jeton.
 */
export default function DevicesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const c = useThemeColors();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      // Celui-ci d'abord, puis le plus récemment actif (le serveur trie déjà par activité).
      const list = await apiRequest<Session[]>('/auth/sessions');
      setSessions([...list].sort((a, b) => Number(b.current) - Number(a.current)));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const label = (s: Session) =>
    s.deviceModel ?? (s.platform === 'web' ? t('devices.browser') : t('devices.unknown'));

  const revoke = (ids: string[]) =>
    Promise.all(ids.map((id) => apiRequest(`/auth/sessions/${id}`, { method: 'DELETE' })))
      .then(() => setSessions((prev) => prev?.filter((s) => !ids.includes(s.id)) ?? prev))
      .catch(() => {
        Alert.alert(t('error'), t('devices.revoke_error'));
        load();
      });

  const confirmOne = (s: Session) =>
    Alert.alert(t('devices.revoke_title'), t('devices.revoke_body', { device: label(s) }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('devices.revoke_action'), style: 'destructive', onPress: () => revoke([s.id]) },
    ]);

  const others = sessions?.filter((s) => !s.current) ?? [];
  const confirmOthers = () =>
    Alert.alert(t('devices.revoke_others'), t('devices.revoke_others_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('devices.revoke_action'),
        style: 'destructive',
        onPress: () => revoke(others.map((s) => s.id)),
      },
    ]);

  /**
   * « Déconnecter tous mes appareils », celui-ci compris — le geste d'urgence (téléphone perdu
   * ou volé). Déplacé ici depuis le profil le 29/10 : c'est là qu'on regarde ses appareils.
   */
  const confirmAll = () =>
    Alert.alert(t('logout_all'), t('logout_all_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout_all_action'),
        style: 'destructive',
        onPress: async () => {
          if (!(await signOut(true))) {
            Alert.alert(t('error'), t('logout_all_error'));
            return;
          }
          router.replace('/(auth)/welcome');
        },
      },
    ]);

  const subtitle = (s: Session) => {
    const parts = [s.osName];
    parts.push(
      s.current
        ? t('devices.this_device')
        : t('devices.last_active', { when: formatListDate(s.lastUsedAt, t) }),
    );
    return parts.filter(Boolean).join(' · ');
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={c.nexa} />
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
          {t('devices.title')}
        </Text>
      </View>

      {sessions === null && !error ? (
        <ActivityIndicator color={c.nexa} className="mt-10" />
      ) : (
        <FlatList
          data={sessions ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <Text className="px-4 pt-4 pb-2 text-sm text-gray-500 dark:text-zinc-400">
              {t('devices.intro')}
            </Text>
          }
          ListEmptyComponent={
            error ? (
              <View className="items-center mt-16 px-8">
                <Text className="text-center text-gray-500 dark:text-zinc-400">
                  {t('devices.load_error')}
                </Text>
                <TouchableOpacity onPress={onRefresh} className="mt-4">
                  <Text className="text-nexa font-semibold">{t('devices.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              disabled={item.current}
              onPress={() => confirmOne(item)}
              className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
            >
              <View className="w-12 h-12 rounded-full bg-blue-50 dark:bg-zinc-800 items-center justify-center">
                <Ionicons
                  name={ICONS[item.platform ?? ''] ?? 'hardware-chip-outline'}
                  size={24}
                  color={c.nexa}
                />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-lg font-medium text-gray-900 dark:text-zinc-100">
                  {label(item)}
                </Text>
                <Text
                  className={`text-sm ${item.current ? 'text-nexa font-medium' : 'text-gray-500 dark:text-zinc-400'}`}
                >
                  {subtitle(item)}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                  {t('devices.since', { date: formatDate(item.createdAt) })}
                </Text>
              </View>
              {!item.current && <Ionicons name="log-out-outline" size={22} color="#EF4444" />}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            sessions ? (
              <View className="mt-6">
                {others.length > 0 && (
                  <TouchableOpacity onPress={confirmOthers} className="mx-4 py-3 items-center">
                    <Text className="text-red-500 font-semibold text-base text-center">
                      {t('devices.revoke_others_button')}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={confirmAll} className="mx-4 py-3 items-center">
                  <Text className="text-red-500 font-semibold text-base text-center">
                    {t('devices.logout_all_button')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
