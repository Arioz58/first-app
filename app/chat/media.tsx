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
import { DocumentViewer } from '../../components/DocumentViewer';
import * as MediaLibrary from 'expo-media-library';
import { apiRequest } from '../../lib/api';
import { firstUrl, formatFileSize } from '../../lib/upload';

const NEXA = '#1E40AF';
const PAGE = 30;
// Catégories dont le contenu a sa place dans la galerie de l'appareil. Les documents et
// l'audio n'ont pas de destination commune : ils se partagent un par un.
const VISUAL_CATEGORIES = ['media', 'images', 'videos', 'gifs'];

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
  // Document ouvert dans la visionneuse intégrée (audio exclu : il se lit sur place).
  const [doc, setDoc] = useState<Msg | null>(null);
  const [saving, setSaving] = useState(false);

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

  // Enregistre les photos/vidéos chargées dans la galerie de l'appareil.
  //
  // Avant, tout partait dans `documentDirectory` — le bac à sable de l'app : les fichiers
  // étaient introuvables pour l'utilisateur. La pellicule est la destination attendue pour
  // des médias, et `expo-media-library` y écrit aussi bien sur iOS que sur Android.
  // (Pour les documents, pas de destination commune : ils se partagent un par un depuis
  // leur visionneuse, d'où un bouton réservé aux catégories visuelles.)
  // Confirmation d'abord : le lot peut être long et va écrire dans la galerie
  // personnelle. L'utilisateur doit savoir combien d'éléments partent.
  const saveAll = () => {
    const count = items.filter((m) => m.mediaUrl).length;
    if (!count) return;
    Alert.alert('', t('media.save_all_confirm', { count }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('media.download'), onPress: runSaveAll },
    ]);
  };

  const runSaveAll = async () => {
    const withMedia = items.filter((m) => m.mediaUrl);
    if (!withMedia.length) return;

    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('', t('media.library_permission'));
      return;
    }

    setSaving(true);
    let ok = 0;
    for (const m of withMedia) {
      try {
        const name = (m.fileName || m.mediaUrl!.split('/').pop() || `file_${m.id}`).replace(
          /[/\\]/g,
          '_',
        );
        // La galerie n'accepte qu'un fichier local : on passe par le cache, qu'iOS et
        // Android purgent d'eux-mêmes ensuite.
        const { uri } = await FileSystem.downloadAsync(
          m.mediaUrl!,
          `${FileSystem.cacheDirectory}${name}`,
        );
        await MediaLibrary.saveToLibraryAsync(uri);
        ok += 1;
      } catch {
        // ignore
      }
    }
    setSaving(false);
    Alert.alert('', t('media.saved_to_gallery', { count: ok }));
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
    else if (m.mediaType === 'document') setDoc(m);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100 flex-1">{title}</Text>
        {VISUAL_CATEGORIES.includes(category) && items.some((m) => m.mediaUrl) ? (
          <TouchableOpacity onPress={saveAll} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={NEXA} />
            ) : (
              <Ionicons name="download-outline" size={22} color={NEXA} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={NEXA} className="mt-8" />
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="folder-open-outline" size={40} color="#D1D5DB" />
          <Text className="text-gray-400 dark:text-zinc-500 mt-3">{t('details.empty_media')}</Text>
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
              <View className="px-4 py-3 border-b border-gray-50 dark:border-zinc-800">
                {item.mediaUrl ? <AudioMessage uri={item.mediaUrl} tint={NEXA} /> : null}
              </View>
            ) : (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
                onPress={() => openItem(item)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={category === 'links' ? 'link' : 'document-text'}
                  size={24}
                  color={NEXA}
                />
                <View className="ml-3 flex-1">
                  <Text className="text-gray-900 dark:text-zinc-100" numberOfLines={1}>
                    {category === 'links'
                      ? firstUrl(item.content) || item.content
                      : item.fileName || 'Document'}
                  </Text>
                  {category !== 'links' && item.fileSize ? (
                    <Text className="text-gray-400 dark:text-zinc-500 text-sm">{formatFileSize(item.fileSize)}</Text>
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

      {doc?.mediaUrl && (
        <DocumentViewer
          url={doc.mediaUrl}
          fileName={doc.fileName}
          fileSize={doc.fileSize}
          onClose={() => setDoc(null)}
        />
      )}
    </SafeAreaView>
  );
}
