import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CountryPicker from '../../components/CountryPicker';
import { FriendsPanel } from '../../components/FriendsPanel';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { COUNTRIES, Country } from '../../lib/countries';
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  RecentSearch,
} from '../../lib/storage';

type RelationStatus =
  | 'self'
  | 'friends'
  | 'request_sent'
  | 'request_received'
  | 'none';

type Card = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  relationStatus: RelationStatus;
};

type SearchResult = { found: false } | { found: true; self: boolean; user: Card };

export default function SearchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [seg, setSeg] = useState<'search' | 'friends'>('search');
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
    const fullPhone =
      country.dialCode + phone.replace(/\s/g, '').replace(/^0+/, '');

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

  const openProfile = (userId: string) => {
    router.push({ pathname: '/user/[id]' as any, params: { id: userId } });
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
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 pt-3 pb-2">
        <Text className="text-2xl font-bold text-nexa mb-3">{t('tabs.search')}</Text>
        {/* Segmented Recherche / Amis */}
        <View className="flex-row bg-gray-100 rounded-full p-1">
          {(['search', 'friends'] as const).map((s) => {
            const active = seg === s;
            return (
              <TouchableOpacity
                key={s}
                className={`flex-1 items-center py-2 rounded-full ${active ? 'bg-white' : ''}`}
                style={active ? { elevation: 1 } : undefined}
                onPress={() => setSeg(s)}
              >
                <Text
                  className={`text-sm font-semibold ${active ? 'text-nexa' : 'text-gray-500'}`}
                >
                  {s === 'search' ? t('tabs.search') : t('friends.title')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {seg === 'friends' ? (
        <FriendsPanel onOpenProfile={openProfile} />
      ) : (
        <View className="flex-1">
          <View className="px-4 pb-2">
            <View className="flex-row items-center">
              <CountryPicker selected={country} onSelect={setCountry} />
          <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3">
            <TextInput
              className="flex-1 py-3 px-1 text-base"
              placeholder={t('search_phone.placeholder')}
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            {loading ? (
              <ActivityIndicator color="#128C7E" size="small" />
            ) : phone.length > 0 ? (
              <TouchableOpacity onPress={() => setPhone('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Erreur inline (introuvable / invalide / propre numéro / échec) */}
        {error && !isSelf ? (
          <Text className="text-gray-500 text-sm mt-3 ml-1">
            {t(`search_phone.${error}`)}
          </Text>
        ) : null}
      </View>

      {/* Carte de résultat */}
      {result ? (
        <View className="px-4">
          {isSelf ? (
            <Text className="text-nexa text-sm mb-2 ml-1">
              {t('search_phone.own_number')}
            </Text>
          ) : null}
          <TouchableOpacity
            className="flex-row items-center p-3 rounded-2xl border border-gray-100 bg-white"
            style={{ elevation: 1 }}
            onPress={() => openProfile(result.id)}
            disabled={isSelf}
          >
            <UserAvatar photoUrl={result.photoUrl} name={result.name} size={52} />
            <View className="flex-1 ml-3">
              <Text className="text-base font-semibold text-gray-900">
                {result.name}
              </Text>
              <Text className="text-gray-500 text-sm">{result.phone}</Text>
            </View>
            {!isSelf && (
              <View className="bg-emerald-50 rounded-full px-3 py-1.5">
                <Text className="text-nexa text-xs font-semibold">
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
          ListHeaderComponent={
            <View className="flex-row items-center justify-between px-4 pt-4 pb-1">
              <Text className="text-xs font-semibold uppercase text-gray-400">
                {t('search_phone.recent')}
              </Text>
              <TouchableOpacity onPress={clearHistory}>
                <Text className="text-nexa text-xs font-semibold">
                  {t('search_phone.clear')}
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 border-b border-gray-50"
              onPress={() => openProfile(item.id)}
            >
              <UserAvatar photoUrl={item.photoUrl} name={item.name} size={44} />
              <View className="flex-1 ml-3">
                <Text className="text-base font-medium text-gray-900">
                  {item.name}
                </Text>
                <Text className="text-gray-500 text-sm">{item.phone}</Text>
              </View>
            </TouchableOpacity>
          )}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
