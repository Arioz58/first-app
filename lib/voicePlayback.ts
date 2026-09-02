import { useSyncExternalStore } from 'react';

/**
 * Vocal en cours de lecture, AU NIVEAU DE L'APPLICATION.
 *
 * ⚠️ Un store externe et non un état d'écran : le lecteur doit survivre à la sortie de la
 * conversation — c'est tout l'objet du mini-player. Un état vivant dans `chat/[id].tsx`
 * serait démonté avec lui, et la lecture s'arrêterait au moment précis où l'on veut qu'elle
 * continue.
 *
 * ⚠️ Le store ne contient QUE de la description (qui joue, quoi, où) : le lecteur natif
 * reste dans le composant qui l'a créé. Déplacer le lecteur ici demanderait de le recréer
 * hors de tout composant, et de gérer sa destruction à la main — pour un gain nul, l'audio
 * d'`expo-audio` continuant de jouer tant que son composant est monté.
 *
 * Le mini-player est donc un RAPPEL affiché ailleurs dans l'app, qui ramène à la
 * conversation ; l'arrêt passe par le rappel `stop` déposé par le lecteur lui-même.
 */
export type VoiceNowPlaying = {
  /** Identifiant du message, pour retrouver la bulle. */
  messageId: string;
  conversationId: string;
  /** Nom de l'expéditeur, affiché dans le mini-player. */
  senderName: string;
  /** Durée totale connue, en millisecondes. */
  durationMs?: number | null;
  /** Arrête la lecture. Fourni par le lecteur, seul détenteur du player natif. */
  stop: () => void;
};

let current: VoiceNowPlaying | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const snapshot = () => current;

/**
 * Déclare le vocal qui démarre.
 *
 * ⚠️ Arrête le précédent : deux vocaux qui se superposent sont inaudibles, et c'est le
 * comportement attendu partout ailleurs (une seule piste à la fois).
 */
export const setNowPlaying = (next: VoiceNowPlaying) => {
  if (current && current.messageId !== next.messageId) current.stop();
  current = next;
  emit();
};

/**
 * Signale la fin d'une lecture.
 *
 * ⚠️ Ne fait rien si un AUTRE vocal a pris la main entre-temps : le lecteur qu'on vient
 * d'arrêter émet lui aussi cet événement, et sans cette garde il effacerait la lecture qui
 * démarre à peine.
 */
export const clearNowPlaying = (messageId: string) => {
  if (current?.messageId !== messageId) return;
  current = null;
  emit();
};

/** Le vocal en cours, ou `null`. ⚠️ Le hook RENVOIE la valeur qu'il observe (cf. CLAUDE.md). */
export const useNowPlaying = (): VoiceNowPlaying | null =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
