import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { ROUND } from '../lib/radius';
import { COUNTRIES, Country } from '../lib/countries';
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  RecentSearch,
} from '../lib/storage';
import BottomSheet from './BottomSheet';
import CountryPicker from './CountryPicker';
import { UserAvatar } from './UserAvatar';

type RelationStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';
type Card = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  relationStatus: RelationStatus;
};
type SearchResult = { found: false } | { found: true; self: boolean; user: Card };

const SHEET_HEIGHT = Dimensions.get('window').height * 0.85;

// Drawer d'ajout d'un contact par NUMÉRO (cas de niche : personne absente du
// répertoire) ou par QR. Le chemin principal reste le répertoire (DirectoryPanel).
export default function AddContactSheet({
  visible,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); // clé i18n sous search_phone.*
  const [result, setResult] = useState<Card | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    getRecentSearches().then(setRecent);
  }, []);

  // Réinitialise la saisie à la fermeture du drawer.
  useEffect(() => {
    if (!visible) {
      setPhone('');
      setResult(null);
      setError('');
      setIsSelf(false);
    }
  }, [visible]);

  useEffect(() => {
    const digits = phone.replace(/\D/g, '');
    setResult(null);
    setIsSelf(false);

    if (digits.length < 6) {
      setError('');
      setLoading(false);
      return;
    }
    if (digits.length > 15) {
      setError('invalid');
      setLoading(false);
      return;
    }

    setError('');
    setLoading(true);
    const id = ++reqId.current;
    const fullPhone = country.dialCode + phone.replace(/\s/g, '').replace(/^0+/, '');

    const handle = setTimeout(async () => {
      try {
        const res = await apiRequest<SearchResult>('/users/search-by-phone', {
          method: 'POST',
          body: { phone: fullPhone },
        });
        if (id !== reqId.current) return;

        if (!res.found) {
          setError('not_found');
        } else if (res.self) {
          setResult(res.user);
          setIsSelf(true);
          setError('own_number');
        } else {
          setResult(res.user);
          const updated = await addRecentSearch({
            id: res.user.id,
            name: res.user.name,
            phone: res.user.phone,
            photoUrl: res.user.photoUrl,
          });
          setRecent(updated);
        }
      } catch {
        if (id === reqId.current) setError('error');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [country, phone]);

  const open = (id: string) => {
    onClose();
    onOpenProfile(id);
  };

  const relationLabel = (s: RelationStatus) =>
    s === 'friends'
      ? t('relation.friends')
      : s === 'request_sent'
        ? t('relation.request_sent')
        : s === 'request_received'
          ? t('relation.respond')
          : t('relation.add_friend');

  const clearHistory = async () => {
    await clearRecentSearches();
    setRecent([]);
  };

  const showRecent = !loading && !result && !error && recent.length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} height={SHEET_HEIGHT}>
        <View className="flex-1 px-4 pt-1">
          <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-3">
            {t('fab.add_contact')}
          </Text>

          <View className="flex-row items-center">
            <CountryPicker selected={country} onSelect={setCountry} />
            <View style={ROUND.inner} className="flex-1 flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3">
              <TextInput
                className="flex-1 py-3 px-1 text-lg text-gray-900 dark:text-zinc-100"
                placeholder={t('search_phone.placeholder')}
                placeholderTextColor="#6B7280"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                autoFocus
              />
              {loading ? (
                <ActivityIndicator color="#1E40AF" size="small" />
              ) : phone.length > 0 ? (
                <TouchableOpacity onPress={() => setPhone('')}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Erreur inline (introuvable / invalide / propre numéro / échec) */}
          {error && !isSelf ? (
            <Text className="text-gray-500 dark:text-zinc-400 text-base mt-3 ml-1">
              {t(`search_phone.${error}`)}
            </Text>
          ) : null}

          {/* Carte de résultat */}
          {result ? (
            <View className="mt-3">
              {isSelf ? (
                <Text className="text-nexa text-base mb-2 ml-1">{t('search_phone.own_number')}</Text>
              ) : null}
              <TouchableOpacity
                className="flex-row items-center p-3 border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                style={{ ...ROUND.bubble, elevation: 1 }}
                onPress={() => open(result.id)}
                disabled={isSelf}
              >
                <UserAvatar photoUrl={result.photoUrl} name={result.name} size={60} />
                <View className="flex-1 ml-3">
                  <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                    {result.name}
                  </Text>
                  <Text className="text-gray-500 dark:text-zinc-400 text-base">{result.phone}</Text>
                </View>
                {!isSelf && (
                  <View className="bg-blue-50 dark:bg-blue-950 rounded-full px-3 py-1.5">
                    <Text className="text-nexa text-sm font-semibold">
                      {relationLabel(result.relationStatus)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Historique des recherches récentes */}
          {showRecent && (
            <FlatList
              data={recent}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              className="mt-2"
              ListHeaderComponent={
                <View className="flex-row items-center justify-between pt-3 pb-1">
                  <Text className="text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
                    {t('search_phone.recent')}
                  </Text>
                  <TouchableOpacity onPress={clearHistory}>
                    <Text className="text-nexa text-sm font-semibold">{t('search_phone.clear')}</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="flex-row items-center py-3 border-b border-gray-50 dark:border-zinc-800"
                  onPress={() => open(item.id)}
                >
                  <UserAvatar photoUrl={item.photoUrl} name={item.name} size={52} />
                  <View className="flex-1 ml-3">
                    <Text className="text-lg font-medium text-gray-900 dark:text-zinc-100">
                      {item.name}
                    </Text>
                    <Text className="text-gray-500 dark:text-zinc-400 text-base">{item.phone}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
    </BottomSheet>
  );
}
