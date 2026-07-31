import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Flou en dégradé : net d'un côté, franchement flou de l'autre.
 *
 * Une `BlurView` applique un flou uniforme ; il n'existe pas d'API publique pour le faire
 * varier dans la hauteur. On empile donc plusieurs couches de faible intensité, chacune
 * découpée par un dégradé (`MaskedView`) qui démarre un peu plus loin que la précédente :
 * là où les couches se superposent, les flous s'additionnent. D'où une montée progressive
 * plutôt qu'une bordure franche.
 *
 * Technique reprise de `beautiful-expo` (David Mokos, MIT), réécrite pour nos versions :
 * le paquet d'origine réclame Reanimated 4.5 / Worklets 0.10, soit Expo SDK 57, alors que
 * le projet est en SDK 54 — l'installer aurait forcé une montée de Reanimated, dont
 * dépend toute l'app.
 */

// 6 couches suffisent à ne plus distinguer les paliers ; au-delà, on paie sans voir.
const IOS_LAYERS = 6;
// Le flou d'Android passe par une implémentation nettement plus coûteuse : on allège.
const ANDROID_LAYERS = 3;

export function ProgressiveBlur({
  edge,
  height,
  intensity = 60,
  style,
}: {
  /** Bord net : `top` = flou en haut qui s'efface vers le bas, et inversement. */
  edge: 'top' | 'bottom';
  height: number;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useColorScheme();
  const tint = scheme === 'dark' ? 'dark' : 'light';
  const layers = Platform.OS === 'ios' ? IOS_LAYERS : ANDROID_LAYERS;
  const layerIntensity = Math.max(1, intensity / layers);

  return (
    <View pointerEvents="none" style={[{ height }, style]}>
      {Array.from({ length: layers }, (_, i) => {
        // Chaque couche commence plus loin que la précédente : la première couvre tout,
        // la dernière n'habille que le bord. Leur cumul dessine la montée.
        const start = i / layers;
        const mid = start + (1 - start) * 0.6;

        const locations =
          edge === 'top' ? [0, start, mid, 1] : [0, 1 - mid, 1 - start, 1];
        const colors =
          edge === 'top'
            ? ['#000', '#000', 'rgba(0,0,0,0.25)', 'transparent']
            : ['transparent', 'rgba(0,0,0,0.25)', '#000', '#000'];

        return (
          <MaskedView
            key={i}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={colors as [string, string, ...string[]]}
                locations={locations as [number, number, ...number[]]}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <BlurView
              intensity={layerIntensity}
              tint={tint}
              // Sans cette option, Android ne floute rien du contenu situé derrière.
              experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        );
      })}
    </View>
  );
}
