import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { resolveBackground } from "../lib/storyBackgrounds";

// Rend le fond d'une story « texte seul » : couleur unie (View) ou dégradé
// diagonal (LinearGradient), selon le preset. Réutilisé par l'éditeur, le
// viewer et la StoriesBar.
export function StoryBackground({
  id,
  style,
  children,
}: {
  id?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const colors = resolveBackground(id);

  if (colors.length === 1) {
    return <View style={[style, { backgroundColor: colors[0] }]}>{children}</View>;
  }

  return (
    <LinearGradient
      colors={colors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
