import { Ionicons } from '@expo/vector-icons';
import * as SMS from 'expo-sms';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  SectionList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { INVITE_URL } from '../lib/config';
import {
  getCachedSync,
  getContactsPermission,
  NexaContact,
  OtherContact,
  requestAndSyncContacts,
} from '../lib/contacts';
import { UserAvatar } from './UserAvatar';

const NEXA = '#1E40AF';
type Phase = 'intro' | 'loading' | 'ready' | 'denied' | 'error';

type Section =
  | { key: 'nexa'; title: string; data: NexaContact[] }
  | { key: 'invite'; title: string; data: OtherContact[] };

export function DirectoryPanel({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const { t } = useTranslation();
  const cachedInit = getCachedSync();
  const [phase, setPhase] = useState<Phase>(cachedInit?.granted ? 'ready' : 'intro');
  const [onNexa, setOnNexa] = useState<NexaContact[]>(
    cachedInit?.granted ? cachedInit.onNexa : [],
  );
  const [others, setOthers] = useState<OtherContact[]>(
    cachedInit?.granted ? cachedInit.others : [],
  );
  const [refreshing, setRefreshing] = useState(false);

  const sync = async (isRefresh = false) => {
    if (!isRefresh) setPhase('loading');
    try {
      const res = await requestAndSyncContacts();
      if (!res.granted) {
        setPhase('denied');
        return;
      }
      setOnNexa(res.onNexa);
      setOthers(res.others);
      setPhase('ready');
    } catch {
      setPhase('error');
    } finally {
      setRefreshing(false);
    }
  };

  // Au montage : si on a déjà des données en cache on les garde (pas de re-fetch,
  // évite le rate-limit) ; sinon on synchronise si l'accès est déjà accordé.
  useEffect(() => {
    if (cachedInit?.granted) return;
    getContactsPermission().then(({ granted }) => {
      if (granted) sync();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async (phone: string) => {
    const message = t('contacts_sync.invite_message', { link: INVITE_URL });
    if (await SMS.isAvailableAsync()) {
      await SMS.sendSMSAsync([phone], message);
    } else {
      Linking.openURL(`sms:${phone}&body=${encodeURIComponent(message)}`).catch(() => {});
    }
  };

  if (phase === 'intro') {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <View className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center mb-6">
          <Ionicons name="people" size={40} color={NEXA} />
        </View>
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 text-center mb-3">
          {t('contacts_sync.intro_title')}
        </Text>
        <Text className="text-base text-gray-500 dark:text-zinc-400 text-center leading-6 mb-8">
          {t('contacts_sync.intro_body')}
        </Text>
        <TouchableOpacity
          className="bg-nexa rounded-full px-8 py-3.5 w-full items-center"
          onPress={() => sync()}
        >
          <Text className="text-white font-semibold text-base">{t('contacts_sync.allow')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'loading') return <ActivityIndicator color={NEXA} className="mt-16" />;

  if (phase === 'denied') {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Ionicons name="lock-closed-outline" size={48} color="#9CA3AF" />
        <Text className="text-base text-gray-500 dark:text-zinc-400 text-center leading-6 mt-4 mb-6">
          {t('contacts_sync.denied_body')}
        </Text>
        <TouchableOpacity
          className="bg-nexa rounded-full px-6 py-3"
          onPress={() => Linking.openSettings()}
        >
          <Text className="text-white font-semibold">{t('contacts_sync.open_settings')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-base text-gray-500 dark:text-zinc-400 text-center mb-5">
          {t('contacts_sync.error')}
        </Text>
        <TouchableOpacity className="bg-nexa rounded-full px-6 py-3" onPress={() => sync()}>
          <Text className="text-white font-semibold">{t('contacts_sync.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sections: Section[] = (
    [
      { key: 'nexa', title: t('contacts_sync.on_nexa'), data: onNexa },
      { key: 'invite', title: t('contacts_sync.invite'), data: others },
    ] as Section[]
  ).filter((s) => s.data.length > 0);

  return (
    <SectionList
      style={{ flex: 1 }}
      sections={sections}
      keyExtractor={(item, i): string =>
        'id' in item ? (item as NexaContact).id : `o-${(item as OtherContact).phone}-${i}`
      }
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); sync(true); }} tintColor={NEXA} />
      }
      ListEmptyComponent={
        <View className="items-center justify-center mt-20 px-10">
          <Ionicons name="people-outline" size={40} color="#9CA3AF" />
          <Text className="text-gray-400 dark:text-zinc-500 text-center mt-4">
            {t('contacts_sync.empty')}
          </Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text className="px-4 pt-5 pb-2 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-900">
          {section.title} · {section.data.length}
        </Text>
      )}
      renderItem={({ item, section }) =>
        section.key === 'nexa' ? (
          <TouchableOpacity
            className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
            onPress={() => onOpenProfile((item as NexaContact).id)}
          >
            <UserAvatar
              photoUrl={(item as NexaContact).photoUrl}
              name={(item as NexaContact).contactName}
              size={52}
            />
            <View className="flex-1 ml-3">
              <Text className="text-lg font-medium text-gray-900 dark:text-zinc-100">
                {(item as NexaContact).contactName}
              </Text>
              {(item as NexaContact).relationStatus === 'friends' && (
                <Text className="text-sm text-nexa">{t('contacts_sync.friend')}</Text>
              )}
            </View>
            <View className="flex-row items-center bg-blue-50 dark:bg-blue-950 rounded-full px-4 py-1.5">
              <Ionicons name="chatbubble" size={15} color={NEXA} />
              <Text className="text-nexa font-semibold text-sm ml-1.5">
                {t('contacts_sync.message')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800">
            <UserAvatar photoUrl={null} name={(item as OtherContact).name} size={52} />
            <View className="flex-1 ml-3">
              <Text className="text-lg font-medium text-gray-900 dark:text-zinc-100">
                {(item as OtherContact).name}
              </Text>
              <Text className="text-sm text-gray-400 dark:text-zinc-500">
                {(item as OtherContact).phone}
              </Text>
            </View>
            <TouchableOpacity
              className="flex-row items-center border border-nexa rounded-full px-4 py-1.5"
              onPress={() => invite((item as OtherContact).phone)}
            >
              <Ionicons name="paper-plane-outline" size={15} color={NEXA} />
              <Text className="text-nexa font-semibold text-sm ml-1.5">
                {t('contacts_sync.invite_button')}
              </Text>
            </TouchableOpacity>
          </View>
        )
      }
    />
  );
}
