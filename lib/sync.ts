import { apiRequest } from './api';
import { loadCache, THREAD_CACHE_SIZE, threadCacheKey, writeCache } from './cache';
import { getActiveConversation } from './unreadMessages';

/**
 * RATTRAPAGE À LA RECONNEXION (29/10, inspiré du client WhatsApp — `WA_REA.md` point 2).
 *
 * ⚠️ POURQUOI : la mémoire locale d'une conversation n'était mise à jour qu'en l'OUVRANT. Des
 * messages reçus sans ouvrir la conversation, puis plus de réseau (métro) : elle s'ouvrait hors
 * ligne sur son ancienne version, alors que la liste en montrait déjà le dernier message.
 *
 * À chaque `connect` du socket, UNE requête (`GET /conversations/sync`) rend la dernière page
 * de chaque conversation qui a bougé depuis le rattrapage précédent, et on la range dans la
 * mémoire locale de chacune.
 *
 * ⚠️ N'écrit QUE la mémoire locale, jamais un écran : l'écran de conversation garde seul la
 * main sur ce qu'il affiche, et c'est lui qui décide d'ouvrir sur le repère des non-lus (les
 * règles du défaut du 11/09 restent les siennes, voir `chat/[id].tsx`).
 */

type CachedMessage = { id: string; createdAt: string };
type SyncResponse = {
  serverTime: string;
  conversations: { id: string; messages: CachedMessage[] }[];
  truncated: boolean;
};

/** Page complète renvoyée par le serveur (`PAGE` de `messages.service.ts`). */
const SERVER_PAGE = 30;
/** Horodatage du SERVEUR au dernier rattrapage — jamais l'horloge du téléphone, qui peut dériver. */
const SINCE_KEY = 'sync_since';

const byTime = (a: CachedMessage, b: CachedMessage) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);

/**
 * Nouvelle fin du fil, à partir de la mémoire et de la page du serveur (du plus récent au plus
 * ancien).
 *
 * ⚠️ FUSION seulement si les deux se rejoignent — un message en commun, ou une page incomplète
 * (c'est alors toute la conversation). Sinon il manque peut-être des messages entre les deux :
 * fusionner laisserait un TROU invisible dans le fil, on garde donc la page seule.
 * Sur le chevauchement, c'est la version du serveur qui gagne (texte modifié, réactions).
 */
const mergeThread = (cached: CachedMessage[] | null, page: CachedMessage[]): CachedMessage[] => {
  const fresh = [...page].sort(byTime);
  if (!cached?.length) return fresh.slice(-THREAD_CACHE_SIZE);
  const ids = new Set(fresh.map((m) => m.id));
  const joins = page.length < SERVER_PAGE || cached.some((m) => ids.has(m.id));
  if (!joins) return fresh.slice(-THREAD_CACHE_SIZE);
  // Plus ancien que la page : on garde la mémoire ; à partir de là, le serveur fait foi.
  const oldest = fresh[0];
  const before = oldest ? cached.filter((m) => !ids.has(m.id) && byTime(m, oldest) < 0) : cached;
  return [...before, ...fresh].slice(-THREAD_CACHE_SIZE);
};

let running: Promise<void> | null = null;

/**
 * Lance un rattrapage. Appelé à chaque `connect` (`app/_layout.tsx`).
 *
 * ⚠️ Un seul à la fois : deux `connect` rapprochés (réseau instable) se partagent le même. Un
 * échec ne fait rien de plus — la date n'avance pas, le `connect` suivant reprendra au même
 * point. Aucun réessai périodique, comme partout ailleurs dans l'app.
 */
export const syncOnConnect = (): Promise<void> => {
  if (running) return running;
  running = (async () => {
    try {
      // ⚠️ `loadCache` et non `readCache` : cette clé n'est pas chargée au démarrage.
      const since = await loadCache<string>(SINCE_KEY);
      const res = await apiRequest<SyncResponse>(
        `/conversations/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`,
      );
      for (const conv of res.conversations) {
        const key = threadCacheKey(conv.id);
        const cached = await loadCache<CachedMessage[]>(key);
        writeCache(key, mergeThread(cached, conv.messages));
      }
      writeCache(SINCE_KEY, res.serverTime);
    } catch {
      // Hors ligne, serveur en panne : la mémoire reste telle quelle, rien n'est perdu.
    } finally {
      running = null;
    }
  })();
  return running;
};

/** Regroupement des messages reçus en rafale : une seule requête pour tous. */
const LIVE_DELAY = 1_500;
let liveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Message reçu EN DIRECT (`conversation_updated`), app ouverte, conversation non ouverte.
 *
 * ⚠️ C'est le cas le plus courant, et `connect` ne le voit pas : le socket est resté connecté
 * tout du long (constaté le 29/10 — B sur la liste, A lui écrit, backend coupé : la
 * conversation s'ouvrait sans ces messages). L'événement ne porte qu'un aperçu allégé du
 * message (pas de quoi l'écrire en mémoire), d'où un rattrapage, qui ne rapporte que ce qui a
 * bougé depuis le précédent.
 *
 * ⚠️ Rien pour la conversation AFFICHÉE : l'écran écrit lui-même sa mémoire à chaque message.
 */
export const syncAfterLiveMessage = (p?: { conversationId?: string }) => {
  if (p?.conversationId && p.conversationId === getActiveConversation()) return;
  if (liveTimer) return;
  liveTimer = setTimeout(() => {
    liveTimer = null;
    syncOnConnect();
  }, LIVE_DELAY);
};
