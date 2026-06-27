// Couleurs d'accent des bulles « moi » d'une conversation (réglage LOCAL et personnel).
// `null` / absent = couleur par défaut de l'app (vert nexa). Stocké = la valeur hex.

export const DEFAULT_BUBBLE_COLOR = '#128C7E'; // nexa

export const BUBBLE_COLORS: string[] = [
  DEFAULT_BUBBLE_COLOR,
  '#075E54', // vert foncé
  '#25D366', // vert clair
  '#0EA5E9', // bleu
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // rose
  '#EF4444', // rouge
  '#F59E0B', // ambre
  '#374151', // gris ardoise
];

// Couleur effective des bulles « moi » (repli sur le vert nexa).
export const resolveBubbleColor = (color?: string | null): string =>
  color ?? DEFAULT_BUBBLE_COLOR;
