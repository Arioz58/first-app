import * as SecureStore from 'expo-secure-store';
import type { ChatWallpaper } from './chatWallpapers';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const USER_ID_KEY = 'userId';
const LANGUAGE_KEY = 'language';
const RECENT_SEARCHES_KEY = 'recentSearches';
const CHAT_WALLPAPERS_KEY = 'chatWallpapers';
const CONV_CUSTOM_KEY = 'conversationCustomizations';
const CONV_CLEARED_KEY = 'conversationClearedAt';

export type RecentSearch = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
};

export const saveTokens = async (accessToken: string, refreshToken: string, userId: string) => {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_ID_KEY, userId);
};

export const getAccessToken = () => SecureStore.getItemAsync(ACCESS_KEY);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);
export const getUserId = () => SecureStore.getItemAsync(USER_ID_KEY);

export const saveLanguage = (lang: string) => SecureStore.setItemAsync(LANGUAGE_KEY, lang);
export const getLanguage = () => SecureStore.getItemAsync(LANGUAGE_KEY);

// Historique local des recherches récentes (max 6, le plus récent en tête).
export const getRecentSearches = async (): Promise<RecentSearch[]> => {
  const raw = await SecureStore.getItemAsync(RECENT_SEARCHES_KEY);
  try {
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
};

export const addRecentSearch = async (item: RecentSearch): Promise<RecentSearch[]> => {
  const current = await getRecentSearches();
  const next = [item, ...current.filter((r) => r.id !== item.id)].slice(0, 6);
  await SecureStore.setItemAsync(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
};

export const clearRecentSearches = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(RECENT_SEARCHES_KEY);
};

// Fonds de conversation : map locale { conversationId → fond } (perso, non partagé).
export const getChatWallpaper = async (
  conversationId: string,
): Promise<ChatWallpaper | null> => {
  const raw = await SecureStore.getItemAsync(CHAT_WALLPAPERS_KEY);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, ChatWallpaper>;
    return map[conversationId] ?? null;
  } catch {
    return null;
  }
};

// `wallpaper = null` → réinitialise au fond par défaut (entrée supprimée).
export const setChatWallpaper = async (
  conversationId: string,
  wallpaper: ChatWallpaper | null,
): Promise<void> => {
  const raw = await SecureStore.getItemAsync(CHAT_WALLPAPERS_KEY);
  let map: Record<string, ChatWallpaper> = {};
  try {
    map = raw ? (JSON.parse(raw) as Record<string, ChatWallpaper>) : {};
  } catch {
    map = {};
  }
  if (wallpaper) map[conversationId] = wallpaper;
  else delete map[conversationId];
  await SecureStore.setItemAsync(CHAT_WALLPAPERS_KEY, JSON.stringify(map));
};

// Personnalisations locales d'une conversation (perso, non partagées) :
// surnom du contact + couleur d'accent des bulles. Map { conversationId → ... }.
export type ConversationCustomization = {
  nickname?: string | null;
  bubbleColor?: string | null;
};

export const getConversationCustomization = async (
  conversationId: string,
): Promise<ConversationCustomization> => {
  const raw = await SecureStore.getItemAsync(CONV_CUSTOM_KEY);
  if (!raw) return {};
  try {
    const map = JSON.parse(raw) as Record<string, ConversationCustomization>;
    return map[conversationId] ?? {};
  } catch {
    return {};
  }
};

export const setConversationCustomization = async (
  conversationId: string,
  patch: ConversationCustomization,
): Promise<ConversationCustomization> => {
  const raw = await SecureStore.getItemAsync(CONV_CUSTOM_KEY);
  let map: Record<string, ConversationCustomization> = {};
  try {
    map = raw ? (JSON.parse(raw) as Record<string, ConversationCustomization>) : {};
  } catch {
    map = {};
  }
  const next = { ...(map[conversationId] ?? {}), ...patch };
  // Nettoie les clés vides pour ne pas garder de surnom/couleur "null".
  if (!next.nickname) delete next.nickname;
  if (!next.bubbleColor) delete next.bubbleColor;
  if (Object.keys(next).length) map[conversationId] = next;
  else delete map[conversationId];
  await SecureStore.setItemAsync(CONV_CUSTOM_KEY, JSON.stringify(map));
  return next;
};

// « Effacer la conversation » : on stocke localement un horodatage ; les messages
// antérieurs sont masqués côté app (personnel, n'affecte pas l'autre — pas de backend).
export const getConversationClearedAt = async (
  conversationId: string,
): Promise<number | null> => {
  const raw = await SecureStore.getItemAsync(CONV_CLEARED_KEY);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    return map[conversationId] ?? null;
  } catch {
    return null;
  }
};

export const setConversationClearedAt = async (
  conversationId: string,
  timestamp: number,
): Promise<void> => {
  const raw = await SecureStore.getItemAsync(CONV_CLEARED_KEY);
  let map: Record<string, number> = {};
  try {
    map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    map = {};
  }
  map[conversationId] = timestamp;
  await SecureStore.setItemAsync(CONV_CLEARED_KEY, JSON.stringify(map));
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_ID_KEY);
};
