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
  style,
  children,
}: {
  radius: number;
  intensity?: number;
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
            overflow: 'hidden',
            borderWidth: 1,
            // Un liseré très discret détache la surface du fond sans la cerner.
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
          borderWidth: 1,
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
