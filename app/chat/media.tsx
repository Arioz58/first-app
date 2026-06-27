import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioMessage } from '../../components/AudioMessage';
import { MediaViewer } from '../../components/MediaViewer';
import { apiRequest } from '../../lib/api';
import { firstUrl, formatFileSize } from '../../lib/upload';

const NEXA = '#128C7E';
const PAGE = 30;

type Msg = {
  id: string;
  content: string | null;
  createdAt: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

export default function MediaScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { conversationId, category, title } = useLocalSearchParams<{
    conversationId: string;
    category: string;
    title: string;
  }>();

  const [items, setItems] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewer, setViewer] = useState<{ type: 'image' | 'video'; url: string } | null>(null);

  const isGrid = category === 'media' || category === 'gifs';

  const load = useCallback(
    async (cursor?: string) => {
      try {
        const page = await apiRequest<Msg[]>(
          `/conversations/${conversationId}/media?category=${category}` +
            (cursor ? `&cursor=${cursor}` : ''),
        );
        setItems((prev) => (cursor ? [...prev, ...page] : page));
        setHasMore(page.length === PAGE);
      } catch {
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [conversationId, category],
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = () => {
    if (loadingMore || !hasMore || !items.length) return;
    setLoadingMore(true);
    load(items[items.length - 1].id);
  };

  // Télécharge toutes les pièces jointes chargées dans le stockage de l'app.
  const downloadAll = async () => {
    const withMedia = items.filter((m) => m.mediaUrl);
    if (!withMedia.length) return;
    let ok = 0;
    for (const m of withMedia) {
      try {
        const name = m.fileName || m.mediaUrl!.split('/').pop() || `file_${m.id}`;
        await FileSystem.downloadAsync(m.mediaUrl!, `${FileSystem.documentDirectory}${name}`);
        ok += 1;
      } catch {
        // ignore
      }
    }
    Alert.alert('', t('media.downloaded', { count: ok }));
  };

  const openItem = (m: Msg) => {
    if (category === 'links') {
      const url = firstUrl(m.content);
      if (url) Linking.openURL(url);
      return;
    }
    if (!m.mediaUrl) return;
    if (m.mediaType === 'video') setViewer({ type: 'video', url: m.mediaUrl });
    else if (m.mediaType === 'image' || m.mediaType === 'gif')
      setViewer({ type: 'image', url: m.mediaUrl });
    else Linking.openURL(m.mediaUrl);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900 flex-1">{title}</Text>
        {category !== 'links' && items.some((m) => m.mediaUrl) ? (
          <TouchableOpacity onPress={downloadAll}>
            <Ionicons name="download-outline" size={22} color={NEXA} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={NEXA} className="mt-8" />
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="folder-open-outline" size={40} color="#D1D5DB" />
          <Text className="text-gray-400 mt-3">{t('details.empty_media')}</Text>
        </View>
      ) : (
        <FlatList
          key={isGrid ? 'grid' : 'list'}
          data={items}
          keyExtractor={(m) => m.id}
          numColumns={isGrid ? 3 : 1}
          contentContainerStyle={{ padding: isGrid ? 2 : 0 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={NEXA} className="my-4" /> : null
          }
          renderItem={({ item }) =>
            isGrid ? (
              <TouchableOpacity
                className="flex-1 m-0.5"
                style={{ aspectRatio: 1 }}
                onPress={() => openItem(item)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: item.mediaUrl ?? undefined }}
                  style={{ width: '100%', height: '100%', borderRadius: 6 }}
                  contentFit="cover"
                />
                {item.mediaType === 'video' ? (
                  <View className="absolute inset-0 items-center justify-center">
                    <Ionicons name="play-circle" size={32} color="white" />
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : category === 'audio' ? (
              <View className="px-4 py-3 border-b border-gray-50">
                {item.mediaUrl ? <AudioMessage uri={item.mediaUrl} tint={NEXA} /> : null}
              </View>
            ) : (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3 border-b border-gray-50"
                onPress={() => openItem(item)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={category === 'links' ? 'link' : 'document-text'}
                  size={24}
                  color={NEXA}
                />
                <View className="ml-3 flex-1">
                  <Text className="text-gray-900" numberOfLines={1}>
                    {category === 'links'
                      ? firstUrl(item.content) || item.content
                      : item.fileName || 'Document'}
                  </Text>
                  {category !== 'links' && item.fileSize ? (
                    <Text className="text-gray-400 text-xs">{formatFileSize(item.fileSize)}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          }
        />
      )}

      {viewer && (
        <MediaViewer type={viewer.type} url={viewer.url} onClose={() => setViewer(null)} />
      )}
    </SafeAreaView>
  );
}
