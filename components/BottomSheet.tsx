import { ReactNode, useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
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

// Ressort partagé de tous les drawers de l'app (identique au « Vu par » des stories).
export const SHEET_SPRING = {
  damping: 24,
  stiffness: 220,
  mass: 0.7,
  overshootClamping: true,
};

// Proportion de glissement vers le bas au-delà de laquelle on ferme au relâcher.
const CLOSE_RATIO = 0.3;
const HIDDEN = 1000; // valeur de repli avant mesure (hors écran)

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Hauteur fixe (ex. liste scrollable). Si absente, la feuille épouse son contenu. */
  height?: number;
  children: ReactNode;
};

/**
 * Bottom-sheet drawer réutilisable : glisse depuis le bas avec le ressort SHEET_SPRING,
 * drag-to-dismiss sur la poignée, backdrop en fondu synchronisé, fermeture au tap.
 * Animation d'entrée/sortie pilotée par `visible` (démontage différé après l'anim).
 */
export default function BottomSheet({
  visible,
  onClose,
  height,
  children,
}: Props) {
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);
  const opened = useRef(false);

  const sheetY = useSharedValue(height ?? HIDDEN);
  const sheetH = useSharedValue(height ?? HIDDEN);

  const setRenderedSync = (v: boolean) => {
    renderedRef.current = v;
    setRendered(v);
  };

  useEffect(() => {
    if (visible) {
      opened.current = false;
      sheetY.value = sheetH.value; // caché en attendant la mesure / l'anim
      setRenderedSync(true);
      if (height) {
        // hauteur connue → on anime tout de suite
        opened.current = true;
        sheetY.value = withSpring(0, SHEET_SPRING);
      }
      // sinon : onLayout déclenchera l'ouverture une fois le contenu mesuré
    } else if (renderedRef.current) {
      // fermeture (depuis n'importe quelle position) puis démontage
      sheetY.value = withSpring(sheetH.value, SHEET_SPRING, (finished) => {
        if (finished) runOnJS(setRenderedSync)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Mesure la hauteur réelle (mode auto) et lance l'ouverture au premier layout.
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    sheetH.value = h;
    if (visible && !opened.current) {
      opened.current = true;
      sheetY.value = h;
      sheetY.value = withSpring(0, SHEET_SPRING);
    }
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - sheetY.value / sheetH.value) * 0.55,
  }));

  // Drag sur la poignée : suit le doigt vers le bas, aimantation fermé/ouvert au relâcher.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      sheetY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose =
        e.velocityY > 300 || sheetY.value > sheetH.value * CLOSE_RATIO;
      if (shouldClose) {
        runOnJS(onClose)();
      } else {
        sheetY.value = withSpring(0, SHEET_SPRING);
      }
    });

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <AnimatedPressable
            className="absolute inset-0 bg-black"
            style={backdropStyle}
            onPress={onClose}
          />
          <Animated.View
            onLayout={height ? undefined : onLayout}
            style={[height ? { height } : null, sheetStyle]}
            className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl"
          >
            <GestureDetector gesture={pan}>
              <View className="pt-3 pb-1">
                <View className="w-10 h-1 rounded-full bg-gray-300 self-center" />
              </View>
            </GestureDetector>
            {height ? <View style={{ flex: 1 }}>{children}</View> : children}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
