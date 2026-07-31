import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type AlbumItem = {
  id: string;
  mediaUrl: string;
  mediaType?: string | null;
};

const THUMB = 48;

/** Une page vidéo a son propre lecteur : on ne lit rien tant qu'on ne l'a pas ouverte. */
function VideoPage({ url, width }: { url: string; width: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={{ width }} className="items-center justify-center">
      <VideoView
        player={player}
        style={{ width: '100%', height: '72%' }}
        contentFit="contain"
        nativeControls
        allowsFullscreen
      />
    </View>
  );
}

/**
 * Visionneuse d'album : pagination horizontale entre les médias d'un même envoi, bande
 * de miniatures en bas pour se repérer et sauter directement à l'un d'eux.
 */
export function AlbumViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: AlbumItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width } = Dimensions.get('window');
  const [index, setIndex] = useState(initialIndex);
  const pagerRef = useRef<FlatList<AlbumItem>>(null);
  const stripRef = useRef<FlatList<AlbumItem>>(null);

  const goTo = (i: number) => {
    setIndex(i);
    pagerRef.current?.scrollToIndex({ index: i, animated: true });
  };

  // La bande suit la page affichée, y compris quand on change de page au swipe.
  const syncStrip = (i: number) => {
    stripRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {/* En-tête : compteur + fermeture */}
        <View className="absolute top-14 left-0 right-0 z-10 flex-row items-center justify-between px-5">
          <Text className="text-white text-base font-medium">
            {index + 1}/{items.length}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={pagerRef}
          data={items}
          keyExtractor={(it) => it.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            setIndex(i);
            syncStrip(i);
          }}
          renderItem={({ item }) =>
            item.mediaType === 'video' ? (
              <VideoPage url={item.mediaUrl} width={width} />
            ) : (
              <Pressable
                onPress={onClose}
                style={{ width }}
                className="items-center justify-center"
              >
                <Image
                  source={{ uri: item.mediaUrl }}
                  style={{ width: '100%', height: '80%' }}
                  contentFit="contain"
                />
              </Pressable>
            )
          }
        />

        {/* Bande de miniatures : masquée s'il n'y a qu'un média à voir. */}
        {items.length > 1 ? (
          <View className="absolute bottom-12 left-0 right-0">
            <FlatList
              ref={stripRef}
              data={items}
              keyExtractor={(it) => `s-${it.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              getItemLayout={(_, i) => ({ length: THUMB + 8, offset: (THUMB + 8) * i, index: i })}
              // Le calage peut échouer si la bande n'est pas encore mesurée : sans ce
              // filet, scrollToIndex lève une erreur au premier rendu.
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index: i }) => (
                <TouchableOpacity onPress={() => goTo(i)} activeOpacity={0.8}>
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={{
                      width: THUMB,
                      height: THUMB,
                      borderRadius: 8,
                      borderWidth: i === index ? 2 : 0,
                      borderColor: 'white',
                      opacity: i === index ? 1 : 0.55,
                    }}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
