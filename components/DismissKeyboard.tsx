import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleProp, ViewStyle } from 'react-native';

// Ferme le clavier quand on appuie dans le vide. À poser autour d'une zone
// contenant des champs de saisie : les taps sur les enfants interactifs (boutons,
// champs, items de liste) passent normalement, seuls les taps « à côté » ferment
// le clavier. `accessible={false}` → transparent pour les lecteurs d'écran.
// Pour les listes (FlatList/ScrollView), préférer `keyboardShouldPersistTaps="handled"`
// + `keyboardDismissMode="on-drag"` : le geste de scroll gère lui-même la fermeture.
export function DismissKeyboard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable accessible={false} onPress={() => Keyboard.dismiss()} style={[{ flex: 1 }, style]}>
      {children}
    </Pressable>
  );
}
