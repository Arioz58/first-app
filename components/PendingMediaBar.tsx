import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ROUND } from '../lib/radius';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** Média choisi mais pas encore envoyé (galerie ou caméra). */
export type PendingMedia = {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  contentType: string;
  durationMs?: number;
};

const THUMB = 64;

// Apparition calquée sur l'avatar central des suggestions (`CenterAvatar` dans
// FloatingSuggestions) : ressort peu raide (stiffness 150). C'est la souplesse qui rend
// le rebond agréable — à raideur élevée, le même rebond devient nerveux et donne
// l'impression que la vignette gonfle puis se rétracte.
const APPEAR_SPRING = { damping: 10, stiffness: 150, mass: 0.7 };

const fmtDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function Thumb({ item, onRemove }: { item: PendingMedia; onRemove: (id: string) => void }) {
  // Une uri de vidéo ne s'affiche pas telle quelle dans une <Image> : il faut en extraire
  // une image. À défaut (extraction en échec), la tuile reste sombre avec son icône.
  const [preview, setPreview] = useState<string | null>(
    item.mediaType === 'image' ? item.uri : null,
  );

  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withSpring(1, APPEAR_SPRING);
  }, [appear]);
  const appearStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: appear.value }],
  }));

  // ⚠️ La sortie est jouée à la main, pas via `exiting` : une layout animation ne part
  // pas de façon fiable quand le parent réorganise ses enfants — retirer une vignette du
  // milieu décale toute la rangée dans la foulée et l'animation saute. Ici on rétrécit
  // d'abord, on retire du state ensuite.
  const remove = () => {
    appear.value = withTiming(0, { duration: 150 }, (finished) => {
      if (finished) runOnJS(onRemove)(item.id);
    });
  };

  useEffect(() => {
    if (item.mediaType !== 'video') return;
    let alive = true;
    VideoThumbnails.getThumbnailAsync(item.uri, { time: 0 })
      .then((r) => {
        if (alive) setPreview(r.uri);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.uri, item.mediaType]);

  return (
    <View className="mr-2">
      <Animated.View style={appearStyle}>
      <View
        className="overflow-hidden bg-gray-200 dark:bg-zinc-800"
        style={{ ...ROUND.inner, width: THUMB, height: THUMB }}
      >
        {preview ? (
          <Image source={{ uri: preview }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="videocam" size={22} color="#9CA3AF" />
          </View>
        )}

        {item.mediaType === 'video' ? (
          <View className="absolute bottom-0 left-0 right-0 flex-row items-center px-1 py-0.5 bg-black/45">
            <Ionicons name="play" size={9} color="white" />
            {item.durationMs ? (
              <Text className="text-white text-[9px] ml-0.5">{fmtDuration(item.durationMs)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Retrait : cible tactile élargie autour de la croix, qui reste petite visuellement. */}
      <TouchableOpacity
        onPress={remove}
        hitSlop={8}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/75 items-center justify-center"
      >
        <Ionicons name="close" size={13} color="white" />
      </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/**
 * Rangée des médias en attente d'envoi, au-dessus de la barre de saisie : on choisit
 * plusieurs photos/vidéos, on les voit, on en retire, puis un seul envoi les fait partir
 * avec le texte éventuel.
 */
export function PendingMediaBar({
  items,
  onRemove,
}: {
  items: PendingMedia[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    // Plus de barre opaque sous la saisie : les vignettes se posent sur le fond.
    <Animated.View entering={FadeIn.duration(160)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item) => (
          <Thumb key={item.id} item={item} onRemove={onRemove} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}
