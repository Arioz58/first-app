import type { ViewStyle } from 'react-native';

/**
 * Arrondis des surfaces de l'app.
 *
 * Deux choses font l'arrondi « façon Apple », et la seconde compte autant que la première :
 *
 * 1. un rayon un peu plus large que le réflexe Tailwind (`rounded-2xl` = 16) ;
 * 2. surtout une courbe CONTINUE (`borderCurve`) plutôt qu'un arc de cercle. Un arc rejoint
 *    le bord droit en changeant brutalement de courbure : l'œil lit un pincement aux quatre
 *    tangentes. iOS trace à la place une superellipse, dont la courbure s'annule
 *    progressivement — d'où la transition douce qu'on associe à ses cartes et ses feuilles.
 *
 * ⚠️ `borderCurve` n'existe QUE sur iOS (RN 0.76+). Android l'ignore silencieusement et
 * rend un arc de cercle ordinaire : les rayons sont identiques, la finesse de la courbe non.
 * Aucun repli n'est possible sans redessiner chaque surface en SVG, ce qui coûterait plus
 * cher que le gain. Voir `android.md`.
 *
 * ⚠️ NE PAS transformer ça en override `theme.extend.borderRadius` dans `tailwind.config`.
 * Même piège que la typo (cf. la note `fontSize` du même fichier) : ça toucherait TOUTES les
 * classes `rounded-*` de l'app, onboarding et composants partagés compris, et le cache
 * NativeWind ne régénère pas la config de façon fiable au reload. On passe donc par des
 * styles explicites, appliqués surface par surface.
 */
export const RADIUS = {
  /** Bulles de message, cartes, tuiles, aperçus. */
  bubble: 20,
  /** En-têtes flottants, drawers, feuilles — les grandes surfaces. */
  surface: 28,
  /** Bloc imbriqué DANS une bulle (citation de story, carte de fichier). */
  inner: 14,
  /** Média collé dans une bulle : rayon de la bulle moins son padding, pour rester concentrique. */
  media: 16,
} as const;

/**
 * Styles prêts à poser. Constantes figées plutôt qu'une fonction : un objet recréé à chaque
 * rendu casserait la mémoïsation des listes de messages.
 */
export const ROUND = {
  bubble: { borderRadius: RADIUS.bubble, borderCurve: 'continuous' },
  surface: { borderRadius: RADIUS.surface, borderCurve: 'continuous' },
  inner: { borderRadius: RADIUS.inner, borderCurve: 'continuous' },
  media: { borderRadius: RADIUS.media, borderCurve: 'continuous' },
  /** Drawer : seuls les coins hauts sont arrondis, le bas déborde sous l'écran. */
  sheet: {
    borderTopLeftRadius: RADIUS.surface,
    borderTopRightRadius: RADIUS.surface,
    borderCurve: 'continuous',
  },
} satisfies Record<string, ViewStyle>;
