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
 * ⚠️ Ces couches ne s'additionnent PAS linéairement : empiler n flous de rayon r revient à
 * un rayon r·√n. Répartir les couches à intervalles réguliers donne donc un flou qui bondit
 * au premier tiers puis stagne — l'œil y lit une bande floue à bord adouci, pas un dégradé.
 * On place donc la i-ième couche sur une courbe en racine (voir plus bas), ce qui rend la
 * montée du flou PERÇU quasi linéaire.
 *
 * Technique reprise de `beautiful-expo` (David Mokos, MIT), réécrite pour nos versions :
 * le paquet d'origine réclame Reanimated 4.5 / Worklets 0.10, soit Expo SDK 57, alors que
 * le projet est en SDK 54 — l'installer aurait forcé une montée de Reanimated, dont
 * dépend toute l'app.
 */

// Chaque couche est un flou masqué à redessiner : le compte se paie dès qu'une animation
// déplace le dégradé (ouverture du clavier). 4 suffisent à ne plus distinguer les paliers
// sur une bande de cette hauteur ; 6 se voyaient surtout dans les images par seconde.
const IOS_LAYERS = 4;
// Le flou d'Android passe par une implémentation nettement plus coûteuse : on allège.
const ANDROID_LAYERS = 3;

// Rampe d'une couche, échantillonnée sur une courbe en S (3t² − 2t³). Sa pente est nulle
// aux deux bouts : ni le début ni la fin d'une couche ne laissent d'arête visible, là où
// une rampe droite marque un pli à chaque extrémité.
const RAMP = [0, 0.156, 0.5, 0.844, 1];

export function ProgressiveBlur({
  edge,
  height,
  intensity = 60,
  layers: layersProp,
  style,
}: {
  /** Côté FLOU : `top` = flou en haut qui s'efface vers le bas, et inversement. */
  edge: 'top' | 'bottom';
  height: number;
  intensity?: number;
  /** À baisser quand le dégradé est redessiné pendant une animation (clavier). */
  layers?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useColorScheme();
  const tint = scheme === 'dark' ? 'dark' : 'light';
  const layers = layersProp ?? (Platform.OS === 'ios' ? IOS_LAYERS : ANDROID_LAYERS);
  const layerIntensity = Math.max(1, intensity / layers);

  return (
    <View pointerEvents="none" style={[{ height }, style]}>
      {Array.from({ length: layers }, (_, i) => {
        // `u` = distance au bord NET, en fraction de la hauteur (0 = net, 1 = flou maximal).
        // La couche i n'atteint son opacité pleine qu'à u = √((i+1)/n) : c'est ce placement
        // en racine qui compense l'empilement décrit en en-tête. Sa rampe couvre deux crans
        // au lieu d'un, si bien que les couches se chevauchent et qu'aucun palier ne sort.
        const from = Math.sqrt(i / layers);
        const to = Math.min(1, Math.sqrt((i + 2) / layers));

        const stops = RAMP.map((alpha, k) => ({
          u: from + (to - from) * (k / (RAMP.length - 1)),
          alpha,
        }));
        if (to < 1) stops.push({ u: 1, alpha: 1 });
        if (from > 0) stops.unshift({ u: 0, alpha: 0 });

        // Le bord net est en bas quand le flou est en haut : `u` s'y compte à rebours, et
        // les arrêts doivent être remis dans l'ordre croissant qu'attend le dégradé.
        const ordered = edge === 'top' ? [...stops].reverse() : stops;
        const locations = ordered.map((s) => (edge === 'top' ? 1 - s.u : s.u));
        const colors = ordered.map((s) => `rgba(0,0,0,${s.alpha})`);

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
