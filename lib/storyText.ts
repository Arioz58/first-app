import type { TextStyle, ViewStyle } from 'react-native';

// Mode de fond d'un texte de story (façon Instagram)
export type BgMode = 'none' | 'translucent' | 'solid';

// Palette proposée dans l'éditeur
export const STORY_COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#00C7BE', '#0A84FF', '#5856D6', '#AF52DE',
  '#FF2D55', '#A2845E',
];

// Valeurs par défaut (et repli pour les anciennes stories sans style)
export const DEFAULT_TEXT_COLOR = '#FFFFFF';
export const DEFAULT_BG_MODE: BgMode = 'translucent';

const SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.8)',
  textShadowRadius: 4,
  textShadowOffset: { width: 1, height: 1 },
} as const;

const BUBBLE_BASE = {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 10,
} as const;

// Typographie commune à tous les textes (taille / alignement).
// La graisse / l'italique / le soulignement sont gérés par getTextFontStyle.
export const TEXT_TYPOGRAPHY = {
  fontSize: 22,
  textAlign: 'center',
} as const;

// Mise en forme par défaut (et repli pour les anciennes stories)
export const DEFAULT_BOLD = true;
export const DEFAULT_ITALIC = false;
export const DEFAULT_UNDERLINE = false;

// Gras / italique / souligné, combinables indépendamment.
export function getTextFontStyle(
  bold: boolean = DEFAULT_BOLD,
  italic: boolean = DEFAULT_ITALIC,
  underline: boolean = DEFAULT_UNDERLINE,
): TextStyle {
  return {
    fontWeight: bold ? 'bold' : 'normal',
    fontStyle: italic ? 'italic' : 'normal',
    textDecorationLine: underline ? 'underline' : 'none',
  };
}

// Noir ou blanc selon la luminance de la couleur de fond (lisibilité du texte)
export function pickContrast(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#000000' : '#FFFFFF';
}

// Styles de la bulle + du texte selon couleur et mode de fond.
export function getTextRenderStyle(
  color: string = DEFAULT_TEXT_COLOR,
  bg: BgMode = DEFAULT_BG_MODE,
): { bubble: ViewStyle; text: TextStyle } {
  if (bg === 'solid') {
    return {
      bubble: { ...BUBBLE_BASE, backgroundColor: color },
      text: { color: pickContrast(color) },
    };
  }
  if (bg === 'none') {
    return {
      bubble: { ...BUBBLE_BASE, backgroundColor: 'transparent' },
      text: { color, ...SHADOW },
    };
  }
  // translucent (défaut)
  return {
    bubble: { ...BUBBLE_BASE, backgroundColor: 'rgba(0,0,0,0.45)' },
    text: { color, ...SHADOW },
  };
}
