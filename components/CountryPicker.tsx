import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COUNTRIES, Country } from "../lib/countries";

type Props = {
  selected: Country;
  onSelect: (country: Country) => void;
};

// Même ressort que le drawer « Vu par » des stories : rapide, sans rebond.
const SHEET_SPRING = {
  damping: 24,
  stiffness: 220,
  mass: 0.7,
  overshootClamping: true,
};

const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.85);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function CountryPicker({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false); // garde le Modal monté le temps de l'anim
  const [search, setSearch] = useState("");

  const sheetY = useSharedValue(SHEET_HEIGHT); // translateY (0 = ouvert, SHEET_HEIGHT = caché)

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search),
  );

  const finalizeClose = () => {
    setMounted(false);
    setSearch("");
  };

  const open = () => {
    sheetY.value = SHEET_HEIGHT;
    setMounted(true);
    sheetY.value = withSpring(0, SHEET_SPRING);
  };

  const close = () => {
    sheetY.value = withSpring(SHEET_HEIGHT, SHEET_SPRING, (finished) => {
      if (finished) runOnJS(finalizeClose)();
    });
  };

  const handleSelect = (country: Country) => {
    onSelect(country);
    close();
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - sheetY.value / SHEET_HEIGHT) * 0.55,
  }));

  // Drag sur la poignée : suit le doigt vers le bas, aimantation fermé/ouvert au relâcher.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      sheetY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose = e.velocityY > 300 || sheetY.value > SHEET_HEIGHT * 0.3;
      if (shouldClose) {
        sheetY.value = withSpring(SHEET_HEIGHT, SHEET_SPRING, (finished) => {
          if (finished) runOnJS(finalizeClose)();
        });
      } else {
        sheetY.value = withSpring(0, SHEET_SPRING);
      }
    });

  return (
    <>
      <TouchableOpacity
        className="flex-row items-center border border-gray-300 rounded-xl px-3 py-3 mr-2"
        onPress={open}
      >
        <Text className="text-xl mr-1">{selected.flag}</Text>
        <Text className="text-base text-gray-700 mr-1">{selected.dialCode}</Text>
        <Ionicons name="chevron-down" size={16} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 justify-end">
            <AnimatedPressable
              className="absolute inset-0 bg-black"
              style={backdropStyle}
              onPress={close}
            />
            <Animated.View
              style={[{ height: SHEET_HEIGHT }, sheetStyle]}
              className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl"
            >
              <GestureDetector gesture={pan}>
                <View className="pt-3 pb-2">
                  <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-3" />
                  <View className="flex-row items-center px-5">
                    <Text className="text-lg font-semibold text-gray-900 flex-1">
                      {t("country_picker.title")}
                    </Text>
                    <TouchableOpacity onPress={close}>
                      <Ionicons name="close" size={26} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              </GestureDetector>

              <View className="px-4 py-3">
                <TextInput
                  className="bg-gray-100 rounded-xl px-4 py-3 text-base"
                  placeholder={t("country_picker.search")}
                  placeholderTextColor="#6B7280"
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              <FlatList
                data={filtered}
                keyExtractor={(item) => item.code}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className="flex-row items-center px-4 py-3 border-b border-gray-50"
                    onPress={() => handleSelect(item)}
                  >
                    <Text className="text-2xl mr-3">{item.flag}</Text>
                    <Text className="flex-1 text-base text-gray-900">
                      {item.name}
                    </Text>
                    <Text className="text-base text-gray-500">
                      {item.dialCode}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </Animated.View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}
