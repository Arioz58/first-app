import { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { STICKER_CATEGORIES } from "../lib/storyStickers";

const { height: SCREEN_H } = Dimensions.get("window");
const PANEL_H = Math.round(SCREEN_H * 0.55);
const NUM_COLUMNS = 6;

// Sélecteur d'emojis (bottom sheet) : onglets par catégorie + glisser pour fermer.
export function EmojiPicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [activeCat, setActiveCat] = useState(0);

  const translateY = useSharedValue(PANEL_H);
  const savedY = useSharedValue(0);

  // Animation d'ouverture
  useEffect(() => {
    if (visible) {
      setActiveCat(0);
      translateY.value = PANEL_H;
      translateY.value = withTiming(0, { duration: 220 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    translateY.value = withTiming(PANEL_H, { duration: 180 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  // Glisser la poignée vers le bas pour fermer
  const pan = Gesture.Pan()
    .onStart(() => {
      savedY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, savedY.value + e.translationY);
    })
    .onEnd((e) => {
      if (translateY.value > PANEL_H * 0.3 || e.velocityY > 800) {
        translateY.value = withTiming(PANEL_H, { duration: 180 }, (f) => {
          if (f) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: (1 - translateY.value / PANEL_H) * 0.5,
  }));

  const category = STICKER_CATEGORIES[activeCat];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <Reanimated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[StyleSheet.absoluteFill, { backgroundColor: "black" }, backdropStyle]}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
      </Reanimated.View>

      <Reanimated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: PANEL_H,
            backgroundColor: "#171717",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 8,
          },
          panelStyle,
        ]}
      >
        {/* Zone draggable : poignée + titre */}
        <GestureDetector gesture={pan}>
          <View style={{ paddingTop: 10, paddingBottom: 4 }}>
            <View className="items-center">
              <View className="w-10 h-1 rounded-full bg-white/30" />
            </View>
            <Text className="text-white text-base font-semibold px-5 pt-2">
              Stickers
            </Text>
          </View>
        </GestureDetector>

        {/* Onglets de catégories */}
        <View className="flex-row px-2 pb-1 border-b border-white/10">
          {STICKER_CATEGORIES.map((c, i) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setActiveCat(i)}
              className="flex-1 items-center py-1.5"
            >
              <Text style={{ fontSize: 22, opacity: i === activeCat ? 1 : 0.4 }}>
                {c.icon}
              </Text>
              {i === activeCat && (
                <View className="w-5 h-0.5 bg-nexa rounded-full mt-1" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Grille de la catégorie active */}
        <FlatList
          data={category.emojis}
          keyExtractor={(item, i) => `${category.id}-${item}-${i}`}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-1 items-center justify-center py-2"
              onPress={() => onPick(item)}
            >
              <Text style={{ fontSize: 36 }}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </Reanimated.View>
    </Modal>
  );
}
