import Animated from 'react-native-reanimated';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { ROUND } from '../lib/radius';
import type { HeaderStyle } from '../lib/headerStyle';

/**
 * ⏳ TEMPORAIRE — enveloppe des en-têtes de conversation, en 3 variantes à comparer.
 *
 * Le client a demandé que l'en-tête cesse de trancher avec le fond de conversation. Voir
 * `lib/headerStyle.ts` pour le contexte et la marche à suivre pour retirer ce dispositif une
 * fois la variante retenue.
 *
 * ⚠️ Les TROIS en-têtes de l'écran passent par ici (conversation, recherche, sélection
 * multiple) : n'en traiter qu'un ferait réapparaître la carte blanche dès qu'on ouvre la
 * recherche — le défaut serait corrigé à moitié, ce qui se remarque plus que pas du tout.
 */

/** L'en-tête se détache du fond : ombre plus large que celle des boutons flottants. */
const HEADER_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
};

export function ChatHeaderShell({
  variant,
  topInset,
  height,
  zIndex,
  entering,
  exiting,
  children,
}: {
  variant: HeaderStyle;
  /** Hauteur de la zone sûre du haut. */
  topInset: number;
  /** Hauteur de la barre elle-même, hors zone sûre. */
  height: number;
  zIndex: number;
  /** Animations Reanimated des en-têtes qui apparaissent (recherche, sélection). */
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
  exiting?: React.ComponentProps<typeof Animated.View>['exiting'];
  children: ReactNode;
}) {
  /**
   * B — Bandeau pleine largeur, façon WhatsApp / Messages d'iOS.
   *
   * ⚠️ Il part de `top: 0` et absorbe la zone sûre dans sa propre hauteur : posé sous elle,
   * il laisserait une bande du fond de conversation au-dessus, ce qui recrée exactement la
   * rupture qu'on cherche à supprimer.
   * ⚠️ `bordered={false}` : un liseré sur toute la largeur dessinerait une ligne d'un bord à
   * l'autre de l'écran — c'est le contraire d'un raccord.
   */
  if (variant === 'banner') {
    return (
      <Animated.View
        entering={entering}
        exiting={exiting}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: topInset + height,
          zIndex,
        }}
      >
        <GlassSurface
          radius={0}
          bordered={false}
          tintOpacity={0.6}
          style={{ flex: 1, paddingTop: topInset }}
        >
          {children}
        </GlassSurface>
      </Animated.View>
    );
  }

  /**
   * C — Aucune surface : le contenu est posé directement sur le fond de conversation, la
   * lisibilité reposant sur le flou progressif déjà présent en haut du fil.
   *
   * ⚠️ Pas d'ombre non plus : elle dessinerait le contour d'une carte invisible.
   */
  if (variant === 'bare') {
    return (
      <Animated.View
        entering={entering}
        exiting={exiting}
        style={{ position: 'absolute', top: topInset + 4, left: 10, right: 10, height, zIndex }}
      >
        {children}
      </Animated.View>
    );
  }

  /**
   * A — Carte flottante en verre dépoli : même traitement que la barre de saisie, dont elle
   * devient le pendant en haut d'écran.
   *
   * ⚠️ L'ombre est portée par la vue EXTÉRIEURE et le rognage par `GlassSurface` : sur iOS,
   * une même vue ne peut pas à la fois projeter une ombre et rogner ses enfants
   * (`overflow: 'hidden'` coupe l'ombre).
   */
  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      style={{
        position: 'absolute',
        top: topInset + 4,
        left: 10,
        right: 10,
        height,
        zIndex,
        ...ROUND.surface,
        ...HEADER_SHADOW,
      }}
    >
      <GlassSurface radius={ROUND.surface.borderRadius} style={{ flex: 1 }}>
        <View className="flex-1">{children}</View>
      </GlassSurface>
    </Animated.View>
  );
}
