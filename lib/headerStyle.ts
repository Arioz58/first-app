import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * ⏳ TEMPORAIRE — sélecteur d'apparence de l'en-tête de conversation.
 *
 * Le client a demandé que l'en-tête cesse de trancher avec le fond de conversation (une carte
 * blanche opaque posée sur un fond coloré). Trois variantes sont livrées EN MÊME TEMPS pour
 * qu'il les compare sur son propre téléphone, avec ses vrais fonds — c'est là que les écarts
 * de lisibilité se voient, pas sur une capture.
 *
 * ⚠️ CE FICHIER EST FAIT POUR ÊTRE SUPPRIMÉ. Une fois la variante retenue, il faut :
 *   1. garder la seule branche choisie dans `renderChatHeader` (`app/chat/[id].tsx`) ;
 *   2. retirer l'entrée « Apparence de l'en-tête » du menu « … » ;
 *   3. supprimer ce module et les clés i18n `header_style.*`.
 * Laissé en place, il devient un réglage que personne n'a décidé d'offrir.
 *
 * ⚠️ Réglage LOCAL et global à l'app (pas par conversation) : c'est une question de style
 * d'interface, pas une personnalisation de conversation comme le fond ou la couleur des
 * bulles. Il n'a donc rien à faire dans les maps `{ conversationId → … }` de `lib/storage.ts`.
 */

export type HeaderStyle = 'glass' | 'banner' | 'bare';

const KEY = 'chat.headerStyle';
const DEFAULT: HeaderStyle = 'glass';

export const HEADER_STYLES: HeaderStyle[] = ['glass', 'banner', 'bare'];

const isValid = (v: string | null): v is HeaderStyle =>
  v === 'glass' || v === 'banner' || v === 'bare';

/**
 * ⚠️ Valeur tenue EN MÉMOIRE, pas relue à chaque rendu : `SecureStore` est asynchrone, et un
 * en-tête ne peut pas attendre une promesse pour savoir comment se dessiner. Le disque n'est
 * lu qu'une fois, au démarrage (`initHeaderStyle`).
 */
let current: HeaderStyle = DEFAULT;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** À appeler au démarrage, comme `initTheme()`. Échec silencieux : on garde le défaut. */
export const initHeaderStyle = async () => {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (isValid(v)) {
      current = v;
      emit();
    }
  } catch {
    // Clé illisible : le défaut fait l'affaire, ce réglage n'est que cosmétique.
  }
};

export const setHeaderStyle = (style: HeaderStyle) => {
  current = style;
  emit();
  SecureStore.setItemAsync(KEY, style).catch(() => {});
};

/**
 * ⚠️ Le hook RENVOIE la valeur observée au lieu de la relire par un appel externe — cf. la
 * règle apprise sur `useMyLiveShare` : le compilateur React a le droit de mémoïser un appel
 * externe sur ses arguments, et l'affichage reste alors figé jusqu'au remontage de l'écran.
 */
export const useHeaderStyle = (): HeaderStyle =>
  useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => current,
  );
