import { useSyncExternalStore } from 'react';

/**
 * Total des messages non lus, pour le badge de l'onglet Discussion.
 *
 * Même choix de store externe que pour les demandes d'ami (`friendRequests.ts`) : le badge
 * est rendu par `(tabs)/_layout`, qui serait aussi le fournisseur s'il s'agissait d'un
 * Context — un composant ne peut pas consommer le Context qu'il fournit.
 *
 * On garde le détail PAR CONVERSATION plutôt qu'un simple total : c'est ce qui permet de
 * remettre une conversation à zéro à son ouverture sans connaître son compte précédent, et
 * de remplacer tout l'état d'un coup quand la liste est rechargée — le serveur faisant foi.
 */
let counts: Record<string, number> = {};
let total = 0;

/**
 * Conversation ouverte à l'écran. Ses messages arrivent sous les yeux de l'utilisateur et
 * sont marqués lus dans la foulée : les compter ferait clignoter le badge en attendant que
 * la liste se recharge.
 */
let activeConversationId: string | null = null;

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => total;

const recompute = () => {
  const next = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (next === total) return;
  total = next;
  listeners.forEach((l) => l());
};

/** Remplace tout l'état à partir de la liste des conversations (le serveur fait foi). */
export const setUnreadCounts = (next: Record<string, number>) => {
  counts = next;
  if (activeConversationId) delete counts[activeConversationId];
  recompute();
};

/** Message reçu dans une conversation qu'on n'est pas en train de lire. */
export const bumpUnread = (conversationId: string) => {
  if (conversationId === activeConversationId) return;
  counts[conversationId] = (counts[conversationId] ?? 0) + 1;
  recompute();
};

/** Conversation lue : ouverture du chat, ou action « marquer comme lu ». */
export const clearUnread = (conversationId: string) => {
  if (!counts[conversationId]) return;
  delete counts[conversationId];
  recompute();
};

export const setActiveConversation = (conversationId: string | null) => {
  activeConversationId = conversationId;
  if (conversationId) clearUnread(conversationId);
};

export const useUnreadMessages = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
