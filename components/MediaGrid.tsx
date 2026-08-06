import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { ROUND } from '../lib/radius';

export type GridItem = {
  id: string;
  mediaUrl: string;
  mediaType?: string | null;
};

const SIZE = 244; // largeur totale de l'album, alignée sur celle d'un média seul
const GAP = 2;
const MAX_TILES = 4;

/**
 * Grille d'un album (plusieurs médias envoyés d'un même geste).
 *
 * 2 médias  → côte à côte
 * 3 médias  → deux en haut, un pleine largeur en bas (une case vide ferait bancal)
 * 4 et plus → 2×2, la dernière tuile assombrie et surmontée de « +N » (N = restants)
 */
export function MediaGrid({
  items,
  onOpen,
  onLongPressItem,
}: {
  items: GridItem[];
  onOpen: (index: number) => void;
  onLongPressItem: (messageId: string) => void;
}) {
  const tiles = items.slice(0, MAX_TILES);
  const extra = items.length - MAX_TILES;
  const half = (SIZE - GAP) / 2;

  // Hauteur de chaque tuile selon la disposition : à 3 médias, la rangée du haut est
  // plus courte pour laisser sa place à la bande du bas.
  const tileSize = (i: number) => {
    if (items.length === 2) return { width: half, height: SIZE * 0.75 };
    if (items.length === 3) {
      return i < 2 ? { width: half, height: half } : { width: SIZE, height: half };
    }
    return { width: half, height: half };
  };

  return (
    <View style={{ width: SIZE, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
      {tiles.map((item, i) => {
        const { width, height } = tileSize(i);
        const isVideo = item.mediaType === 'video';
        const showExtra = extra > 0 && i === MAX_TILES - 1;

        return (
          <Pressable
            key={item.id}
            onPress={() => onOpen(i)}
            onLongPress={() => onLongPressItem(item.id)}
            delayLongPress={300}
          >
            <Image
              source={{ uri: item.mediaUrl }}
              style={{ width, height, ...ROUND.inner }}
              contentFit="cover"
            />

            {/* Vidéo : pastille de lecture, sauf si la tuile porte déjà le « +N ». */}
            {isVideo && !showExtra ? (
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-9 h-9 rounded-full bg-black/45 items-center justify-center">
                  <Ionicons name="play" size={18} color="white" />
                </View>
              </View>
            ) : null}

            {showExtra ? (
              <View
                className="absolute inset-0 items-center justify-center bg-black/55"
                style={ROUND.inner}
              >
                <Text className="text-white text-2xl font-semibold">+{extra}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
