import { colorScheme, useColorScheme } from 'nativewind';
import * as SecureStore from 'expo-secure-store';

// Préférence de thème choisie par l'utilisateur.
// 'system' = suit les réglages de l'appareil (défaut). 'light'/'dark' = forcé.
export type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'themePref';

export const getThemePref = async (): Promise<ThemePref> => {
  const v = (await SecureStore.getItemAsync(THEME_KEY)) as ThemePref | null;
  return v === 'light' || v === 'dark' ? v : 'system'; // fallback clair/système
};

// Applique + persiste la préférence. `colorScheme.set` (NativeWind) accepte
// 'system'|'light'|'dark' et pilote les variants `dark:` de toute l'app.
export const setThemePref = async (pref: ThemePref) => {
  colorScheme.set(pref);
  await SecureStore.setItemAsync(THEME_KEY, pref);
};

// À appeler au démarrage (avant le rendu) pour restaurer le choix de l'utilisateur.
export const initTheme = async () => {
  try {
    colorScheme.set(await getThemePref());
  } catch {
    colorScheme.set('system'); // fallback : suit le système
  }
};

// --- Couleurs sémantiques pour les props en dur (icônes, ActivityIndicator…) ---
const LIGHT = {
  canvas: '#FFFFFF', // fond de l'app
  surface: '#FFFFFF', // cartes, barres, header
  card: '#FFFFFF',
  content: '#111827', // texte principal
  muted: '#6B7280', // texte secondaire
  faint: '#9CA3AF', // placeholders / icônes discrètes
  line: '#E5E7EB', // bordures
  nexa: '#1E40AF', // accent (icônes/textes) — foncé sur fond clair
};
const DARK = {
  canvas: '#0B0B0F',
  surface: '#18181B',
  card: '#1F1F23',
  content: '#F4F4F5',
  muted: '#A1A1AA',
  faint: '#71717A',
  line: '#27272A',
  nexa: '#3B82F6', // accent éclairci pour le contraste sur fond sombre
};

export type ThemeColors = typeof LIGHT;

// Hook : renvoie la palette effective selon le thème courant (réactif au switch).
export const useThemeColors = (): ThemeColors => {
  const { colorScheme: scheme } = useColorScheme();
  return scheme === 'dark' ? DARK : LIGHT;
};
