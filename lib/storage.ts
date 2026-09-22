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
const LIVE_SHARES_KEY = 'liveShares';

export type RecentSearch = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
};

/**
 * Accessibilité des clés de SESSION dans le trousseau iOS.
 *
 * ⚠️ SANS CECI, RIEN NE FONCTIONNE ÉCRAN VERROUILLÉ. Le défaut d'`expo-secure-store` est
 * `WHEN_UNLOCKED` : le trousseau devient illisible dès que le téléphone est verrouillé.
 * Constaté le 22/09 sur les appels — on décrochait depuis l'écran verrouillé, l'application
 * n'arrivait pas à lire son jeton, la requête partait sans authentification, échouait, et
 * l'appel se terminait aussitôt. Symptôme : « ça décroche puis raccroche direct ».
 *
 * `AFTER_FIRST_UNLOCK` rend la clé lisible dès le premier déverrouillage qui suit un
 * redémarrage, y compris ensuite écran verrouillé. C'est le réglage qu'exige toute
 * application devant agir en arrière-plan — appels, accusés de réception, réponse depuis
 * une notification.
 *
 * ⚠️ Compromis assumé : après un redémarrage, tant que le téléphone n'a pas été déverrouillé
 * UNE fois, la session reste illisible — et c'est très bien ainsi, c'est ce qui protège les
 * jetons sur un téléphone éteint qu'on aurait volé.
 *
 * ⚠️ N'est posé QUE sur les clés de session. Les réglages cosmétiques (fonds, surnoms)
 * n'ont aucune raison d'être lisibles verrouillé.
 */
const SESSION_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const saveTokens = async (accessToken: string, refreshToken: string, userId: string) => {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken, SESSION_OPTIONS);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken, SESSION_OPTIONS);
  await SecureStore.setItemAsync(USER_ID_KEY, userId, SESSION_OPTIONS);
};

/**
 * Réécrit la session avec la bonne accessibilité.
 *
 * ⚠️ Une clé garde l'accessibilité qu'elle avait À L'ÉCRITURE : changer l'option ne touche
 * pas ce qui est déjà stocké. Sans cette reprise, il faudrait se déconnecter et se
 * reconnecter pour que les appels fonctionnent écran verrouillé — ce que personne ne
 * devinerait.
 *
 * ⚠️ Appelée au démarrage, donc téléphone déverrouillé : c'est le seul moment où l'ancienne
 * valeur est lisible.
 */
export const migrateSessionAccessibility = async () => {
  try {
    const [a, r, u] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_ID_KEY),
    ]);
    if (!a || !r || !u) return;
    await saveTokens(a, r, u);
  } catch {
    // Trousseau indisponible : on réessaiera au prochain démarrage.
  }
};

/**
 * Écrit le SEUL jeton d'accès, sans toucher au reste de la session.
 *
 * ⚠️ Indispensable au renouvellement : `POST /auth/refresh` ne renvoie QUE `accessToken`.
 * Passer par `saveTokens` y écrivait donc `undefined` par-dessus le jeton de rafraîchissement
 * — voir le commentaire dans `api.ts`.
 */
export const saveAccessToken = (accessToken: string) =>
  // ⚠️ Même accessibilité que le reste de la session : un jeton renouvelé sans cette option
  // redeviendrait illisible écran verrouillé, et le défaut réapparaîtrait au bout de 15 min.
  SecureStore.setItemAsync(ACCESS_KEY, accessToken, SESSION_OPTIONS);

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
/**
 * COPIE MÉMOIRE des réglages locaux de conversation.
 *
 * ⚠️ POURQUOI : ces réglages vivent dans SecureStore, dont la lecture est ASYNCHRONE. L'écran
 * de conversation se peignait donc avec le fond par défaut, puis basculait sur le fond
 * personnalisé une fois la lecture revenue. Invisible tant que le fil lui-même mettait une
 * seconde à arriver ; flagrant depuis qu'il s'affiche instantanément — le fond est devenu la
 * dernière chose à se mettre en place.
 *
 * ⚠️ Toutes les conversations tiennent dans UNE clé (une map), donc une seule lecture au
 * démarrage suffit à rendre tous les réglages disponibles sans attente.
 */
let wallpapersCache: Record<string, ChatWallpaper> | null = null;
let customizationsCache: Record<string, ConversationCustomization> | null = null;

const parseMap = <T>(raw: string | null): Record<string, T> => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, T>;
  } catch {
    return {};
  }
};

/**
 * Charge les réglages locaux en mémoire. À appeler au démarrage, sous l'écran de lancement.
 *
 * ⚠️ Échec silencieux : sans ces réglages l'application est parfaitement utilisable, elle
 * affiche simplement ses fonds par défaut. Rien qui justifie de retarder le lancement.
 */
export const hydrateLocalSettings = async (): Promise<void> => {
  try {
    const [w, c] = await Promise.all([
      SecureStore.getItemAsync(CHAT_WALLPAPERS_KEY),
      SecureStore.getItemAsync(CONV_CUSTOM_KEY),
    ]);
    wallpapersCache = parseMap<ChatWallpaper>(w);
    customizationsCache = parseMap<ConversationCustomization>(c);
  } catch {
    wallpapersCache = {};
    customizationsCache = {};
  }
};

/**
 * Lectures SYNCHRONES, pour le premier rendu.
 *
 * ⚠️ `null` si l'hydratation n'a pas eu lieu : l'appelant retombe alors sur la lecture
 * asynchrone, et sur l'ancien comportement — un fond qui arrive après coup, jamais un écran
 * cassé.
 */
export const getChatWallpaperSync = (conversationId: string): ChatWallpaper | null =>
  wallpapersCache?.[conversationId] ?? null;

export const getConversationCustomizationSync = (
  conversationId: string,
): ConversationCustomization => customizationsCache?.[conversationId] ?? {};

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
  // ⚠️ La copie mémoire suit, sinon la lecture synchrone servirait l'ancien fond jusqu'au
  // prochain lancement — on choisirait un fond, et le suivant le verrait disparaître.
  wallpapersCache = map;
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
  // Même raison que pour les fonds : la copie mémoire est la source des lectures synchrones.
  customizationsCache = map;
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

/**
 * ⚠️ PLUS AUCUN APPELANT depuis le 13/09 : « Effacer la discussion » est passé côté serveur
 * (`POST /conversations/:id/clear`), pour que l'effacement suive le compte et non l'appareil.
 * Conservée uniquement parce que `getConversationClearedAt` doit continuer de LIRE ce qui a
 * été écrit avant — sans quoi les conversations effacées jusque-là réapparaîtraient à la mise
 * à jour. Ne plus l'appeler ; supprimer les deux quand le parc aura tourné.
 */
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

/**
 * Partages de position en cours : `conversationId` → échéance (ms epoch).
 *
 * ⚠️ Persistés, et pas seulement gardés en mémoire : la tâche de localisation est réveillée
 * par le système dans un contexte JS qui peut être neuf, où les variables de l'app n'existent
 * plus. Sans cette trace sur disque, elle ne saurait pas à quelles conversations envoyer.
 */
export const getLiveShares = async (): Promise<Record<string, number>> => {
  try {
    const raw = await SecureStore.getItemAsync(LIVE_SHARES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
};

export const setLiveShares = async (shares: Record<string, number>) => {
  try {
    await SecureStore.setItemAsync(LIVE_SHARES_KEY, JSON.stringify(shares));
  } catch {
    // Écriture impossible : le suivi de premier plan continue de fonctionner en mémoire.
  }
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_ID_KEY);
};
