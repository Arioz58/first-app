import { useSyncExternalStore } from 'react';
import { apiRequest } from './api';

/**
 * Compteur global des demandes d'ami reçues en attente.
 *
 * Store externe plutôt qu'un Context : le badge est rendu par `(tabs)/_layout`,
 * qui serait aussi le fournisseur du Context — un composant ne peut pas consommer
 * le Context qu'il fournit. Ici, `_layout`, `search` et `FriendsPanel` lisent tous
 * la même valeur sans hiérarchie imposée.
 */
let count = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => count;

export const setPendingFriendRequests = (next: number) => {
  const value = Math.max(0, next);
  if (value === count) return;
  count = value;
  listeners.forEach((l) => l());
};

/** Incrément optimiste (socket `friend_request_received`) — évite un aller-retour réseau. */
export const incrementPendingFriendRequests = () => setPendingFriendRequests(count + 1);

export const refreshPendingFriendRequests = async () => {
  try {
    const received = await apiRequest<unknown[]>('/friends/requests/received');
    setPendingFriendRequests(received.length);
  } catch {
    // Hors-ligne ou session expirée : on conserve la dernière valeur connue.
  }
};

export const usePendingFriendRequests = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
