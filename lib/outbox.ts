import * as FileSystem from 'expo-file-system/legacy';
import { getSocket } from './socket';
import { getUserId } from './storage';
import { toUploadableImage, uploadFile } from './upload';

/**
 * FILE D'ENVOI — un message écrit n'est jamais perdu (29/10, inspiré du client WhatsApp :
 * « Outbox » persistée, identifiant de message généré par l'appareil, voir `WA_REA.md` point 1).
 *
 * ⚠️ POURQUOI : jusqu'ici l'envoi était un `socket.emit` et rien d'autre. socket.io garde bien
 * en mémoire ce qui part hors ligne et le rejoue à la reconnexion — mais en MÉMOIRE : l'app
 * tuée (ou gelée puis purgée par iOS) avant le retour du réseau, et le message disparaissait
 * sans un mot. Même chose pour un média dont le téléversement échouait : la bulle était
 * retirée et l'utilisateur devait tout recommencer.
 *
 * Trois règles, toutes nécessaires :
 * 1. ÉCRIT SUR DISQUE AVANT D'ÊTRE ENVOYÉ. L'élément est dans la file avant tout appel réseau ;
 *    il n'en sort que sur l'ACCUSÉ du serveur (`ack` de `send_message`). Entre les deux, quoi
 *    qu'il arrive à l'app, il sera renvoyé au prochain lancement.
 * 2. RENVOYER EST SANS RISQUE. Chaque message porte un `clientId` tiré ici ; le serveur
 *    (`Message.clientId`, unique par expéditeur) rend le message existant au lieu d'en créer
 *    un second. C'est ce qui permet de renvoyer tout ce qui n'a pas été confirmé, sans jamais
 *    se demander si c'était déjà parti.
 * 3. UN ENVOI À LA FOIS PAR CONVERSATION. L'ordre écrit est l'ordre reçu, médias compris : un
 *    texte tapé après une photo attend la photo. Les conversations, elles, avancent en parallèle.
 *
 * ⚠️ HORS DE L'ÉCRAN DE CHAT, volontairement : quitter la conversation, ou l'app, ne doit rien
 * annuler. L'écran ne fait qu'AFFICHER la file (bulles « en envoi ») et écouter ses issues.
 *
 * ⚠️ Pas de réessai périodique à vide : la file repart sur l'événement `connect` du socket. Un
 * minuteur ne sert qu'à retenter un élément qui a échoué ALORS que la connexion était là
 * (accusé qui ne vient pas, téléversement interrompu), avec un délai croissant.
 *
 * ⚠️ Cloisonnée par COMPTE, comme `lib/cache.ts` : la file d'un compte ne doit jamais partir
 * sous l'identité du suivant.
 */

const ROOT = `${FileSystem.documentDirectory}outbox/`;

/** Ce qui part au serveur — les champs de `send_message`, moins la conversation et le `clientId`. */
export type OutboxPayload = {
  content?: string;
  type?: string;
  /** Média DÉJÀ en ligne (GIF Giphy). Un fichier du téléphone passe par `file`. */
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationMs?: number;
  batchId?: string;
  replyToId?: string;
  latitude?: number;
  longitude?: number;
};

export type OutboxItem = {
  clientId: string;
  conversationId: string;
  createdAt: string;
  payload: OutboxPayload;
  /**
   * Fichier à téléverser avant l'envoi, COPIÉ dans le dossier de la file.
   *
   * ⚠️ Un NOM et non un chemin complet : sur iOS, le chemin du dossier de l'app change à chaque
   * mise à jour (le conteneur est renommé). Un chemin absolu enregistré deviendrait faux après
   * la mise à jour, et la file perdrait ses fichiers.
   */
  file?: { name: string; contentType: string; image: boolean };
  /** Adresse S3 obtenue : un renvoi ne re-téléverse pas. */
  uploadedUrl?: string;
  attempts: number;
  /**
   * Échec DÉFINITIF : le serveur a refusé (bloqué, plus membre…), ou le fichier a disparu, ou
   * le téléversement échoue encore et encore. L'élément reste dans la file — l'utilisateur
   * choisit de réessayer ou de supprimer —, mais on ne le renvoie plus de soi-même.
   */
  failed?: string;
  /** Ce que la bulle affiche en attendant (citation). Jamais envoyé : le serveur relit l'original. */
  display?: Record<string, unknown>;
};

export type OutboxEvent =
  | { type: 'sent'; clientId: string; conversationId: string; message: Record<string, unknown> }
  | { type: 'failed'; clientId: string; conversationId: string; reason: string }
  | { type: 'removed'; clientId: string; conversationId: string };

/** Délai d'attente de l'accusé. Au-delà, l'élément est renvoyé plus tard (sans risque). */
const ACK_TIMEOUT = 15_000;
/** Téléversements ratés ALORS QUE le réseau répondait, avant d'abandonner. */
const MAX_UPLOAD_ATTEMPTS = 6;

let owner: string | null = null;
let items: OutboxItem[] = [];
const running = new Set<string>();
const listeners = new Set<(e: OutboxEvent) => void>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2_000;
/** Écriture disque en cours : les suivantes s'enchaînent, jamais deux en même temps. */
let writing: Promise<void> = Promise.resolve();

const dir = () => `${ROOT}${owner}/`;
export const outboxFileUri = (name: string) => `${dir()}${name}`;

const emit = (e: OutboxEvent) => listeners.forEach((l) => l(e));

export const subscribeOutbox = (l: (e: OutboxEvent) => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * Enregistre la file. ⚠️ ATTENDU par `enqueue` avant tout envoi : c'est la règle n°1.
 * Les écritures sont mises en série — deux écritures parallèles du même fichier pourraient se
 * terminer dans le désordre et laisser sur le disque l'état le plus ancien.
 */
const persist = () => {
  if (!owner) return Promise.resolve();
  const snapshot = JSON.stringify(items);
  const target = `${dir()}queue.json`;
  writing = writing
    .then(() => FileSystem.writeAsStringAsync(target, snapshot))
    .catch(() => {
      // Disque plein : la file reste juste en mémoire et l'envoi continue. Seule la survie à
      // un arrêt brutal est perdue — rien qui justifie de bloquer l'utilisateur.
    });
  return writing;
};

/**
 * Charge la file du compte. Appelé au démarrage (sous l'écran de lancement) et à la connexion.
 *
 * ⚠️ Fait aussi le MÉNAGE des fichiers : un média envoyé n'est pas effacé tout de suite, la bulle
 * l'affiche encore (basculer sur l'adresse S3 la ferait clignoter). Il l'est au lancement
 * suivant, quand plus rien ne le montre.
 */
export const initOutbox = async (userId: string): Promise<void> => {
  if (owner === userId) return;
  owner = userId;
  items = [];
  running.clear();
  try {
    await FileSystem.makeDirectoryAsync(dir(), { intermediates: true });
    const raw = await FileSystem.readAsStringAsync(`${dir()}queue.json`).catch(() => '[]');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) items = parsed;
    const keep = new Set(items.map((i) => i.file?.name).filter(Boolean));
    const files = await FileSystem.readDirectoryAsync(dir());
    await Promise.all(
      files
        .filter((f) => f !== 'queue.json' && !keep.has(f))
        .map((f) => FileSystem.deleteAsync(`${dir()}${f}`, { idempotent: true })),
    );
  } catch {
    // File illisible : on repart vide plutôt que de bloquer l'app.
  }
  kickOutbox();
};

/** Les éléments d'une conversation, dans l'ordre — de quoi poser les bulles « en envoi ». */
export const outboxFor = (conversationId: string): OutboxItem[] =>
  items.filter((i) => i.conversationId === conversationId);

/**
 * Identifiant d'un message, tiré par l'appareil.
 *
 * ⚠️ Pas de `crypto.randomUUID` : il demanderait `expo-crypto`, module natif (rebuild). Il n'a
 * besoin d'être unique que pour UN expéditeur (contrainte `[senderId, clientId]` côté serveur) :
 * l'horodatage en millisecondes plus 64 bits d'aléa y suffisent largement.
 */
const rand = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
export const newClientId = () => `${Date.now().toString(36)}-${rand()}${rand()}`;

/** Ajout à la file. Les fichiers sont copiés AVANT l'écriture : la file ne pointe jamais dans le vide. */
export const enqueue = async (
  entries: {
    conversationId: string;
    payload: OutboxPayload;
    /** Fichier du téléphone (galerie, caméra, vocal, document) à téléverser. */
    localFile?: { uri: string; contentType: string; image: boolean };
    display?: Record<string, unknown>;
    clientId?: string;
  }[],
): Promise<OutboxItem[]> => {
  // ⚠️ Filet : la file est normalement chargée au démarrage. Sans propriétaire, rien ne serait
  // écrit sur disque ni envoyé (`kickOutbox` l'exige) — le message resterait en mémoire.
  if (!owner) {
    const me = await getUserId();
    if (me) await initOutbox(me);
  }
  const added: OutboxItem[] = [];
  for (const e of entries) {
    const clientId = e.clientId ?? newClientId();
    let file: OutboxItem['file'];
    if (e.localFile) {
      const ext = e.localFile.uri.split('?')[0].match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? 'bin';
      const name = `${clientId}.${ext}`;
      try {
        // ⚠️ COPIE : le sélecteur et l'enregistreur rangent leurs fichiers dans le cache, que le
        // système peut vider. Sur iOS la copie est un clone (APFS), quasi instantanée même
        // pour une vidéo.
        await FileSystem.copyAsync({ from: e.localFile.uri, to: outboxFileUri(name) });
        file = { name, contentType: e.localFile.contentType, image: e.localFile.image };
      } catch {
        // Copie impossible : on garde le chemin d'origine (reconnu à sa barre oblique, voir
        // `itemFileUri`). Il survivra presque toujours — au pire, `file_missing` au renvoi.
        file = { name: e.localFile.uri, contentType: e.localFile.contentType, image: e.localFile.image };
      }
    }
    const item: OutboxItem = {
      clientId,
      conversationId: e.conversationId,
      createdAt: new Date().toISOString(),
      payload: e.payload,
      file,
      attempts: 0,
      display: e.display,
    };
    items.push(item);
    added.push(item);
  }
  await persist();
  kickOutbox();
  return added;
};

/** Adresse locale du fichier d'un élément (bulle « en envoi »). */
export const itemFileUri = (item: OutboxItem): string | undefined =>
  item.file ? (item.file.name.includes('/') ? item.file.name : outboxFileUri(item.file.name)) : undefined;

/** « Réessayer » sur une bulle en échec : l'élément reprend sa place dans la file. */
export const retryOutbox = async (clientId: string) => {
  const item = items.find((i) => i.clientId === clientId);
  if (!item) return;
  item.failed = undefined;
  item.attempts = 0;
  await persist();
  kickOutbox();
};

/** « Supprimer » sur une bulle en échec. */
export const removeFromOutbox = async (clientId: string) => {
  const item = items.find((i) => i.clientId === clientId);
  if (!item) return;
  items = items.filter((i) => i !== item);
  await persist();
  emit({ type: 'removed', clientId, conversationId: item.conversationId });
};

const fail = async (item: OutboxItem, reason: string) => {
  item.failed = reason;
  await persist();
  emit({ type: 'failed', clientId: item.clientId, conversationId: item.conversationId, reason });
};

const scheduleRetry = () => {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    kickOutbox();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
};

type Ack = { ok: true; message: Record<string, unknown> } | { ok: false; reason: string };

/** Envoi avec accusé. `null` = pas de réponse (coupure, délai) : à renvoyer plus tard. */
const sendWithAck = (body: Record<string, unknown>): Promise<Ack | null> =>
  new Promise((resolve) => {
    const socket = getSocket();
    if (!socket?.connected) return resolve(null);
    socket.timeout(ACK_TIMEOUT).emit('send_message', body, (err: unknown, res: Ack) => {
      resolve(err || !res ? null : res);
    });
  });

/**
 * Un élément : téléversement s'il le faut, puis envoi. Rend `false` s'il faut s'arrêter là
 * pour cette conversation (pas de réseau, accusé absent) — l'ordre doit être respecté.
 */
const processItem = async (item: OutboxItem): Promise<boolean> => {
  if (item.file && !item.uploadedUrl) {
    const uri = itemFileUri(item)!;
    const exists = await FileSystem.getInfoAsync(uri).then((i) => i.exists).catch(() => false);
    if (!exists) {
      await fail(item, 'file_missing');
      return true;
    }
    try {
      // ⚠️ Normalisé JUSTE AVANT l'envoi (HEIC → JPEG) : la bulle affiche l'original, qui s'y
      // décode très bien.
      const src = item.file.image
        ? await toUploadableImage(uri, item.file.contentType)
        : { uri, contentType: item.file.contentType };
      item.uploadedUrl = await uploadFile(src.uri, src.contentType, 'chat');
      await persist();
    } catch {
      // Sans réseau, ce n'est pas l'élément qui est en cause : `connect` relancera. ⚠️ Et ça ne
      // compte PAS comme une tentative — sinon quelques coupures suffiraient à l'abandonner.
      if (!getSocket()?.connected) return false;
      item.attempts += 1;
      if (item.attempts >= MAX_UPLOAD_ATTEMPTS) {
        await fail(item, 'upload');
        return true;
      }
      await persist();
      scheduleRetry();
      return false;
    }
  }

  const ack = await sendWithAck({
    conversationId: item.conversationId,
    clientId: item.clientId,
    ...item.payload,
    ...(item.uploadedUrl ? { mediaUrl: item.uploadedUrl } : {}),
  });
  if (!ack) {
    if (getSocket()?.connected) scheduleRetry();
    return false;
  }
  if (!ack.ok) {
    await fail(item, ack.reason);
    return true;
  }
  items = items.filter((i) => i !== item);
  await persist();
  retryDelay = 2_000;
  emit({ type: 'sent', clientId: item.clientId, conversationId: item.conversationId, message: ack.message });
  return true;
};

/** Fait avancer la file d'une conversation, élément par élément. */
const drain = async (conversationId: string) => {
  if (running.has(conversationId)) return;
  running.add(conversationId);
  try {
    for (;;) {
      const next = items.find((i) => i.conversationId === conversationId && !i.failed);
      if (!next) break;
      if (!(await processItem(next))) break;
    }
  } finally {
    running.delete(conversationId);
  }
};

/**
 * Relance la file. Appelé à l'ajout, à chaque `connect` du socket et au retour au premier plan.
 * Sans connexion, ne fait rien : c'est `connect` qui reprendra.
 */
export const kickOutbox = () => {
  if (!owner || !getSocket()?.connected) return;
  const convs = new Set(items.filter((i) => !i.failed).map((i) => i.conversationId));
  convs.forEach((c) => {
    drain(c);
  });
};

/** Compte propriétaire de la file : auteur des bulles « en envoi » qu'on reconstruit. */
export const outboxOwner = () => owner;
