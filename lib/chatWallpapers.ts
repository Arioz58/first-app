// Fonds de conversation — réglage PERSONNEL et LOCAL (par appareil), jamais partagé :
// la personne en face ne voit pas notre fond. Même principe que lib/storyBackgrounds.ts,
// mais les tons sont volontairement clairs pour garder les bulles lisibles.
// Un fond = soit un preset (id → couleurs unies/dégradé), soit une photo perso (uri locale).
// `null` = fond par défaut (blanc, look d'origine du chat).

import type { ImageSourcePropType } from 'react-native';

export type ChatWallpaper =
  | { kind: 'preset'; id: string }
  | { kind: 'photo'; uri: string };

// Un preset porte soit des couleurs (uni/dégradé), soit une image (`asset`).
export type ChatWallpaperPreset = {
  id: string;
  colors?: string[];
  asset?: ImageSourcePropType;
};

// Asset nexa, variante claire/sombre.
// - Défaut (aucun choix, `null`) → suit le thème de l'appareil.
// - Presets explicites `nexa_light` / `nexa_dark` → forcent une variante, peu importe le thème.
export const DEFAULT_WALLPAPER_ASSET: { light: ImageSourcePropType; dark: ImageSourcePropType } = {
  light: require('../assets/images/conversation_bg/light_bg_nexa.png'),
  dark: require('../assets/images/conversation_bg/dark_bg_nexa.png'),
};

// `colors` à 1 élément = fond uni ; 2+ = dégradé diagonal ; `asset` = image.
export const CHAT_WALLPAPERS: ChatWallpaperPreset[] = [
  { id: 'nexa_light', asset: DEFAULT_WALLPAPER_ASSET.light },
  { id: 'nexa_dark', asset: DEFAULT_WALLPAPER_ASSET.dark },
  { id: 'beige', colors: ['#ECE5DD'] }, // beige classique façon WhatsApp
  { id: 'mint', colors: ['#DCF8E8'] },
  { id: 'sky', colors: ['#DCECFB'] },
  { id: 'sand', colors: ['#FBEEDB'] },
  { id: 'lavender', colors: ['#EAE6F7'] },
  { id: 'rose', colors: ['#FCE4EC'] },
  { id: 'ocean', colors: ['#A1C4FD', '#C2E9FB'] },
  { id: 'sunset', colors: ['#FAD0C4', '#FFD1FF'] },
  { id: 'night', colors: ['#232526', '#414345'] },
  { id: 'forest', colors: ['#1D2B26', '#2C3E37'] },
];

// Couleur de repli si un id de preset est inconnu (le vrai défaut est l'asset nexa).
export const DEFAULT_CHAT_BG = '#FFFFFF';

// Image d'un preset (id → asset), ou undefined si c'est un preset couleur.
export const resolvePresetAsset = (id?: string | null): ImageSourcePropType | undefined =>
  CHAT_WALLPAPERS.find((w) => w.id === id)?.asset;

// Couleurs d'un preset ; repli sur le fond par défaut.
export const resolveChatWallpaper = (id?: string | null): string[] =>
  CHAT_WALLPAPERS.find((w) => w.id === id)?.colors ?? [DEFAULT_CHAT_BG];
