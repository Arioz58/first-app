import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

// Largeur d'un bouton : de quoi loger « Archiver » sur une ligne sans troncature.
const ACTION_W = 78;

export type SwipeAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  /** Referme la ligne après l'action (par défaut), sinon la laisse ouverte. */
  keepOpen?: boolean;
};

/**
 * Rangée de boutons révélée par le glissement.
 *
 * ⚠️ La translation animée est indispensable : les actions sont posées juste en dehors du
 * bord de la ligne et n'y entrent que si on les déplace avec le doigt. Rendues sans elle,
 * elles restaient à leur position fermée — d'où des boutons entrevus une fraction de
 * seconde, puis recouverts par la ligne au fil du glissement.
 */
function SwipeActions({
  actions,
  drag,
  side,
  methods,
}: {
  actions: SwipeAction[];
  drag: SharedValue<number>;
  side: 'left' | 'right';
  methods: SwipeableMethods;
}) {
  const width = actions.length * ACTION_W;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: side === 'right' ? drag.value + width : drag.value - width }],
  }));

  return (
    <Reanimated.View style={[{ width, flexDirection: 'row' }, style]}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          onPress={() => {
            if (!action.keepOpen) methods.close();
            action.onPress();
          }}
          activeOpacity={0.85}
          style={{ width: ACTION_W, backgroundColor: action.color }}
          className="items-center justify-center"
        >
          <Ionicons name={action.icon} size={22} color="#fff" />
          <Text className="text-white text-xs font-medium mt-1" numberOfLines={1}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </Reanimated.View>
  );
}

/**
 * Glissement latéral sur une ligne de conversation.
 *
 * Les gestes doublent des actions qui restent accessibles par appui long : un geste ne
 * s'annonce pas de lui-même, et rien ne doit dépendre du seul fait de l'avoir découvert.
 */
export function ConversationSwipe({
  left,
  right,
  children,
}: {
  left: SwipeAction[];
  right: SwipeAction[];
  children: ReactNode;
}) {
  return (
    <ReanimatedSwipeable
      friction={2}
      // Seuils courts : les boutons s'ouvrent d'un geste franc, sans traverser l'écran.
      leftThreshold={ACTION_W / 2}
      rightThreshold={ACTION_W / 2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        left.length
          ? (_progress, drag, methods) => (
              <SwipeActions actions={left} drag={drag} side="left" methods={methods} />
            )
          : undefined
      }
      renderRightActions={
        right.length
          ? (_progress, drag, methods) => (
              <SwipeActions actions={right} drag={drag} side="right" methods={methods} />
            )
          : undefined
      }
      onSwipeableWillOpen={() => Haptics.selectionAsync().catch(() => {})}
    >
      <View>{children}</View>
    </ReanimatedSwipeable>
  );
}
