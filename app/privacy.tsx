import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../components/BottomSheet';
import { apiRequest } from '../lib/api';

const NEXA = '#128C7E';
const TRIPLE = ['everyone', 'friends', 'nobody'] as const;
const FR_VALUES = ['everyone', 'friends_of_friends', 'nobody'] as const;

type Privacy = {
  privacyPhoto: string;
  privacyBio: string;
  privacyLastSeen: string;
  privacyLocation: string;
  privacyPhone: string;
  privacyMessages: string;
  privacyCalls: string;
  privacyFriendRequests: string;
  locationEnabled: boolean;
};

type FieldKey = keyof Omit<Privacy, 'locationEnabled'>;

// Champ → clé i18n du libellé
const LABEL_KEY: Record<FieldKey, string> = {
  privacyPhoto: 'photo',
  privacyBio: 'bio',
  privacyLastSeen: 'last_seen',
  privacyLocation: 'location',
  privacyPhone: 'phone',
  privacyMessages: 'messages',
  privacyCalls: 'calls',
  privacyFriendRequests: 'friend_requests',
};

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<{ key: FieldKey; options: readonly string[] } | null>(
    null,
  );

  useEffect(() => {
    apiRequest<{ profile: Privacy }>('/users/me')
      .then((u) => setPrivacy(u.profile))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patch = (data: Partial<Privacy>) => {
    setPrivacy((p) => (p ? { ...p, ...data } : p));
    apiRequest('/users/me/privacy', { method: 'PATCH', body: data }).catch(() => {});
  };

  const selectValue = (value: string) => {
    if (picker) patch({ [picker.key]: value } as Partial<Privacy>);
    setPicker(null);
  };

  if (loading || !privacy) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={NEXA} />
      </View>
    );
  }

  const Row = ({ field, options }: { field: FieldKey; options: readonly string[] }) => (
    <TouchableOpacity
      className="flex-row items-center px-4 py-4 border-b border-gray-50"
      onPress={() => setPicker({ key: field, options })}
    >
      <Text className="flex-1 text-base text-gray-900">
        {t(`privacy_settings.${LABEL_KEY[field]}` as any)}
      </Text>
      <Text className="text-gray-400 mr-1">
        {t(`privacy_settings.${privacy[field]}` as any)}
      </Text>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900">
          {t('privacy_settings.title')}
        </Text>
      </View>

      <ScrollView>
        <Text className="px-4 pt-5 pb-1 text-xs font-semibold uppercase text-gray-400">
          {t('privacy_settings.section_visibility')}
        </Text>
        <View className="bg-white">
          <Row field="privacyPhoto" options={TRIPLE} />
          <Row field="privacyBio" options={TRIPLE} />
          <Row field="privacyLastSeen" options={TRIPLE} />
          <Row field="privacyPhone" options={TRIPLE} />

          {/* Localisation : toggle de partage + qui peut la voir */}
          <View className="flex-row items-center px-4 py-4 border-b border-gray-50">
            <Text className="flex-1 text-base text-gray-900">
              {t('privacy_settings.location_enabled')}
            </Text>
            <Switch
              value={privacy.locationEnabled}
              onValueChange={(v) => patch({ locationEnabled: v })}
              trackColor={{ true: NEXA }}
            />
          </View>
          {privacy.locationEnabled && <Row field="privacyLocation" options={TRIPLE} />}
        </View>

        <Text className="px-4 pt-5 pb-1 text-xs font-semibold uppercase text-gray-400">
          {t('privacy_settings.section_contact')}
        </Text>
        <View className="bg-white">
          <Row field="privacyMessages" options={TRIPLE} />
          <Row field="privacyCalls" options={TRIPLE} />
          <Row field="privacyFriendRequests" options={FR_VALUES} />
        </View>

        {/* Utilisateurs bloqués */}
        <View className="bg-white mt-5">
          <TouchableOpacity
            className="flex-row items-center px-4 py-4"
            onPress={() => router.push('/blocked' as any)}
          >
            <Ionicons name="ban-outline" size={20} color="#EF4444" />
            <Text className="flex-1 ml-3 text-base text-gray-900">
              {t('moderation.blocked_users')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <View className="h-8" />
      </ScrollView>

      {/* Sélecteur de valeur */}
      <BottomSheet visible={picker !== null} onClose={() => setPicker(null)}>
        <Text className="text-lg font-bold text-gray-900 px-5 pt-1 pb-2">
          {picker ? t(`privacy_settings.${LABEL_KEY[picker.key]}` as any) : ''}
        </Text>
        {picker?.options.map((opt) => {
          const active = privacy[picker.key] === opt;
          return (
            <TouchableOpacity
              key={opt}
              className="flex-row items-center px-5 py-4"
              onPress={() => selectValue(opt)}
            >
              <Text
                className={`flex-1 text-base ${active ? 'font-bold' : 'text-gray-900'}`}
                style={active ? { color: NEXA } : undefined}
              >
                {t(`privacy_settings.${opt}` as any)}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={NEXA} />}
            </TouchableOpacity>
          );
        })}
        <View className="pb-8" />
      </BottomSheet>
    </SafeAreaView>
  );
}
