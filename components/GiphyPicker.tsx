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
import { GIPHY_API_KEY } from '../lib/config';

type Gif = { id: string; preview: string; original: string };

const configured = !!GIPHY_API_KEY && (GIPHY_API_KEY as string) !== 'GIPHY_API_KEY_PLACEHOLDER';

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

  const fetchGifs = useCallback(async (q: string) => {
    if (!configured) return;
    setLoading(true);
    try {
      const endpoint = q ? 'search' : 'trending';
      const url =
        `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13` +
        (q ? `&q=${encodeURIComponent(q)}` : '');
      const res = await fetch(url).then((r) => r.json());
      setGifs(
        (res.data ?? []).map((g: any) => ({
          id: g.id,
          preview: g.images.fixed_width_small?.url ?? g.images.fixed_width.url,
          original: g.images.original.url,
        })),
      );
    } catch {
      setGifs([]);
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

        {!configured ? (
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
