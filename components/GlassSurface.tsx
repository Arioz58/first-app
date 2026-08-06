import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';

/** Ombre douce des boutons pleins de la zone de saisie, qui flottent sur le fond. */
export const FLOATING_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

/**
 * Surface en verre dépoli : le fond de conversation transparaît, le contenu reste lisible.
 *
 * ⚠️ Le flou n'est pris qu'sur iOS, où il est rendu nativement. Sur Android, `expo-blur`
 * s'appuie sur une implémentation nettement plus coûteuse et au rendu différent : on y
 * pose une surface très légèrement translucide, visuellement proche et sans risque de
 * saccade sur la barre de saisie, qui est redessinée à chaque frappe.
 */
export function GlassSurface({
  radius,
  intensity = 60,
  bordered = true,
  tintOpacity = 0.55,
  style,
  children,
}: {
  radius: number;
  intensity?: number;
  /** Le liseré fait le tour ; à désactiver sur un bandeau pleine largeur. */
  bordered?: boolean;
  /** Force du voile blanc (clair) ou anthracite (sombre) posé sur le flou. */
  tintOpacity?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        style={[
          {
            borderRadius: radius,
            // Sans effet quand la surface est une gélule (rayon = moitié de la hauteur),
            // mais indispensable dès qu'un appelant passe un rayon plus court.
            borderCurve: 'continuous',
            overflow: 'hidden',
            // Voile posé sur le flou. Le flou seul prend la couleur de ce qu'il y a
            // derrière : sur un fond de conversation chargé, la surface se confond avec
            // lui et le champ devient difficile à situer. Ce voile lui redonne une assise
            // sans l'opacifier.
            backgroundColor: isDark
              ? `rgba(24,24,27,${tintOpacity})`
              : `rgba(255,255,255,${tintOpacity})`,
            // Un liseré très discret détache la surface du fond sans la cerner.
            borderWidth: bordered ? 1 : 0,
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
          },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius,
          borderCurve: 'continuous',
          borderWidth: bordered ? 1 : 0,
          backgroundColor: isDark ? 'rgba(24,24,27,0.90)' : 'rgba(255,255,255,0.90)',
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
