// Couleurs d'accent des bulles « moi » d'une conversation (réglage LOCAL et personnel).
// `null` / absent = couleur par défaut de l'app (bleu). Stocké = la valeur hex.

export const DEFAULT_BUBBLE_COLOR = '#1E40AF'; // bleu principal de l'app

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

// Couleur effective des bulles « moi » (repli sur le bleu nexa).
export const resolveBubbleColor = (color?: string | null): string =>
  color ?? DEFAULT_BUBBLE_COLOR;

// Éclaircit (`amount` > 0) ou assombrit (< 0) une couleur, en la mélangeant vers le blanc
// ou le noir. Travailler par mélange plutôt qu'en jouant sur chaque canal garde la teinte.
export const shade = (hex: string, amount: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = (c: number) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * Dégradé d'une bulle « moi » : une nuance claire en haut, une plus profonde en bas.
 * Dérivé de la couleur choisie plutôt que codé en dur, pour que la personnalisation des
 * bulles continue de fonctionner quelle que soit la teinte retenue.
 */
export const bubbleGradient = (color: string): [string, string] => [
  shade(color, 0.24),
  shade(color, -0.14),
];
