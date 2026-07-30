import { View } from 'react-native';

// Lueur bleue diffuse (pas une forme) derrière une image d'onboarding.
// Beaucoup de disques superposés, chacun quasi transparent, du plus grand au
// plus petit : l'accumulation forme une lumière dense au centre qui se dissout
// totalement vers les bords → aucun bord de cercle visible, juste de la lumière.
// Pur JS (aucune lib native), à placer en 1er enfant d'un conteneur centré.
const LAYERS = 28;

export function BlueAura({ size = 300 }: { size?: number }) {
  return (
    <>
      {Array.from({ length: LAYERS }).map((_, i) => {
        // i=0 → plus grand disque (le plus faible, sous la pile) ; i croît → plus petit.
        const s = size * (1 - i / (LAYERS + 4));
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: s,
              height: s,
              borderRadius: s / 2,
              backgroundColor: 'rgba(59,130,246,0.018)',
            }}
          />
        );
      })}
    </>
  );
}
