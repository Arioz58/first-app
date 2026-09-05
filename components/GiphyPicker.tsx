import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../lib/api';

type Gif = { id: string; preview: string; original: string };

/**
 * ⚠️ Les GIFs passent par NOTRE serveur (`GET /giphy`), plus par `api.giphy.com`.
 *
 * La clé d'API était écrite en dur dans `lib/config.ts`, donc embarquée dans le bundle et
 * lisible par quiconque ouvre l'IPA ou l'APK — et déjà partie dans l'historique git. Tant que
 * l'application l'utilisait, la révoquer aurait cassé les GIFs sur tous les téléphones
 * installés. Côté serveur, elle vit dans une variable d'environnement : on peut la changer
 * sans publier de version.
 *
 * ⚠️ L'écran « clé absente » ne disparaît pas, il change de cause : c'est désormais le serveur
 * qui répond 503 quand `GIPHY_API_KEY` n'est pas défini chez lui.
 */

export default function GiphyPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  const fetchGifs = useCallback(async (q: string) => {
    setLoading(true);
    try {
      // Le serveur renvoie déjà les GIFs réduits à { id, preview, original } — rien à remapper.
      const { gifs: found } = await apiRequest<{ gifs: Gif[] }>(
        `/giphy${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      );
      setGifs(found);
      setAvailable(true);
    } catch {
      setGifs([]);
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Tendances à l'ouverture + recherche débouncée.
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => fetchGifs(query.trim()), query ? 350 : 0);
    return () => clearTimeout(id);
  }, [visible, query, fetchGifs]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 py-2 border-b border-gray-100 dark:border-zinc-800">
          <TouchableOpacity onPress={onClose} className="mr-3">
            <Ionicons name="close" size={24} color="#1E40AF" />
          </TouchableOpacity>
          <TextInput
            className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full px-4 py-2 text-gray-900 dark:text-zinc-100"
            placeholder={t('media.gif_search')}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>

        {!available ? (
          <View className="flex-1 items-center justify-center px-10">
            <Ionicons name="key-outline" size={40} color="#D1D5DB" />
            <Text className="text-gray-400 dark:text-zinc-500 text-center mt-3">{t('media.gif_no_key')}</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color="#1E40AF" className="mt-8" />
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={3}
            contentContainerStyle={{ padding: 4 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-1 m-1"
                onPress={() => onSelect(item.original)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: item.preview }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }}
                  contentFit="cover"
                />
              </TouchableOpacity>
            )}
          />
        )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
