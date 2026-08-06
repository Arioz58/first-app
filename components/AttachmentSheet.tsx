import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import BottomSheet from './BottomSheet';

export type AttachAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
  /** Annoncée mais pas encore livrée : tuile en sourdine + mention sous le libellé. */
  coming?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Mention affichée sous les actions `coming` (ex. « Bientôt »). */
  comingLabel: string;
  actions: AttachAction[];
};

// Deux ressorts distincts, et c'est tout l'enjeu du rendu :
// - la MONTÉE rebondit légèrement (amorti bas) → c'est de là que vient le « flow » ;
// - l'ÉCHELLE, elle, ne dépasse pas (amorti haut). Un rebond sur la taille se lit comme
//   un frétillement dès qu'il y a plusieurs tuiles décalées, alors qu'un dépassement de
//   deux pixels sur la montée passe pour de l'élan.
const TILE_RISE = { damping: 13, stiffness: 180, mass: 0.65 };
const TILE_SCALE = { damping: 20, stiffness: 220, mass: 0.7 };
const TILE_STAGGER = 55; // décalage entre deux tuiles
const TILE_DELAY = 40; // laisse la feuille s'engager avant que la grille démarre
const TILE_RISE_PX = 24;

function AttachTile({
  action,
  index,
  onRun,
  comingLabel,
}: {
  action: AttachAction;
  index: number;
  onRun: (a: AttachAction) => void;
  comingLabel: string;
}) {
  const rise = useSharedValue(0); // montée + opacité
  const scale = useSharedValue(0); // échelle

  useEffect(() => {
    const delay = TILE_DELAY + index * TILE_STAGGER;
    rise.value = withDelay(delay, withSpring(1, TILE_RISE));
    scale.value = withDelay(delay, withSpring(1, TILE_SCALE));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.value * 2),
    transform: [
      { translateY: TILE_RISE_PX * (1 - rise.value) },
      { scale: 0.9 + 0.1 * scale.value },
    ],
  }));

  return (
    <Animated.View className="w-1/3 items-center mt-5" style={anim}>
      <TouchableOpacity className="items-center" activeOpacity={0.75} onPress={() => onRun(action)}>
        <View
          // Rayon laissé à 24 : sur un carré de 64, l'agrandir tirerait la tuile vers le
          // cercle. Seule la courbe continue change, et c'est ce qui la rapproche d'une
          // icône d'app iOS.
          className="w-16 h-16 rounded-3xl items-center justify-center"
          style={{
            backgroundColor: action.color,
            opacity: action.coming ? 0.4 : 1,
            borderCurve: 'continuous',
          }}
        >
          <Ionicons name={action.icon} size={29} color="white" />
        </View>
        <Text className="text-sm text-gray-700 dark:text-zinc-300 mt-2">{action.label}</Text>
        {action.coming ? (
          <Text className="text-[10px] text-gray-400 dark:text-zinc-500">{comingLabel}</Text>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

/**
 * Panneau de pièces jointes du chat : bottom-sheet (même ressort que les autres drawers
 * de l'app) présentant les sources en grille. Remplace l'ancienne rangée de pastilles
 * posée au-dessus de la barre de saisie, qui n'avait pas la place d'accueillir plus de
 * trois entrées et se superposait au fil.
 */
export function AttachmentSheet({ visible, onClose, title, comingLabel, actions }: Props) {
  // L'action n'est PAS lancée au tap : toutes ouvrent quelque chose (picker natif, Modal
  // GIF, Alert). Présenter cet écran pendant que la feuille se referme laisse un modal
  // fantôme qui capte les touches et fige l'app. On mémorise donc le choix et on ne le
  // déclenche qu'une fois la feuille démontée (`onClosed`).
  const pendingRef = useRef<AttachAction | null>(null);

  const run = (action: AttachAction) => {
    Haptics.selectionAsync().catch(() => {});
    pendingRef.current = action;
    onClose();
  };

  const handleClosed = () => {
    const action = pendingRef.current;
    pendingRef.current = null;
    if (!action) return;
    // Une frame de marge : le Modal vient d'être démonté côté React, iOS termine son
    // retrait au run loop suivant.
    requestAnimationFrame(() => action.onPress());
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={handleClosed}>
      <View className="px-4 pb-10 pt-2">
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100 px-1 mb-1">
          {title}
        </Text>

        <View className="flex-row flex-wrap">
          {actions.map((action, i) => (
            <AttachTile
              key={action.key}
              action={action}
              index={i}
              onRun={run}
              comingLabel={comingLabel}
            />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}
