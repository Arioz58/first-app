import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { enterPlaybackMode } from './audioMode';

/**
 * Lecture des messages vocaux, AU NIVEAU DE L'APPLICATION.
 *
 * ⚠️ Le lecteur natif est créé ICI, hors de tout composant — c'est la condition pour qu'un
 * vocal survive à la sortie de sa conversation.
 *
 * Une première version laissait le lecteur dans la bulle (`useAudioPlayer`) et se contentait
 * de publier « qui joue ». Elle ne pouvait pas marcher : ce hook s'appuie sur
 * `useReleasingSharedObject`, qui LIBÈRE le lecteur natif au démontage du composant. Quitter
 * l'écran démontait donc la bulle, et le son se coupait au moment précis où le mini-player
 * devait prendre le relais. `createAudioPlayer` n'a pas ce cycle de vie : sa destruction est
 * à notre charge, et c'est exactement ce qu'on veut.
 */

/** Cadence des mesures de progression. 500 ms par défaut = deux images par seconde. */
const UPDATE_MS = 100;

export type VoiceTrack = {
  /** Identifiant du message : sert à retrouver la bulle et à éviter les doublons. */
  messageId: string;
  conversationId: string;
  uri: string;
  senderName: string;
  /** Photo affichée par le mini-player : celle du groupe, ou de l'interlocuteur. */
  photoUrl?: string | null;
  /** Conversation de groupe : l'avatar par défaut change (deux silhouettes). */
  isGroup?: boolean;
  durationMs?: number | null;
};

export type VoiceState = {
  track: VoiceTrack;
  playing: boolean;
  /**
   * La piste est allée jusqu'au bout.
   *
   * ⚠️ Drapeau explicite, et non déduit de `currentTime >= duration` : à la fin on remet la
   * position à zéro pour que la bulle reparte propre, ce qui effaçait justement l'indice
   * dont la reprise avait besoin — le vocal devenait alors impossible à réécouter.
   */
  finished: boolean;
  /** Secondes écoulées et durée réelle, telles que le lecteur les rapporte. */
  currentTime: number;
  duration: number;
  rate: number;
  /** Appui donné, son pas encore sorti — l'attente du premier chargement. */
  loading: boolean;
};

let player: AudioPlayer | null = null;
let state: VoiceState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;

/**
 * Détruit le lecteur courant.
 *
 * ⚠️ `remove()` est obligatoire : `createAudioPlayer` ne libère rien tout seul, et un lecteur
 * abandonné garderait sa ressource native jusqu'à la fermeture de l'app.
 */
const dispose = () => {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // Lecteur déjà libéré : rien à faire.
  }
  player = null;
};

/**
 * Lance un vocal. Reprend au début s'il était terminé.
 *
 * ⚠️ Un seul vocal à la fois : démarrer en arrête un autre. Deux pistes simultanées sont
 * inaudibles, et c'est le comportement attendu partout ailleurs.
 */
export const playVoice = (track: VoiceTrack, rate = 1) => {
  if (state?.track.messageId === track.messageId && player) {
    // Même message : reprise là où on s'était arrêté, ou depuis le début si la piste est
    // allée au bout.
    enterPlaybackMode();
    if (state.finished) player.seekTo(0);
    player.play();
    state = {
      ...state,
      playing: true,
      loading: true,
      finished: false,
      currentTime: state.finished ? 0 : state.currentTime,
    };
    emit();
    return;
  }

  dispose();
  // ⚠️ Sortie sur le haut-parleur garantie : sur iOS, une session restée en capture
  // (enregistrement interrompu) ferait jouer le vocal dans l'écouteur téléphonique.
  enterPlaybackMode();
  player = createAudioPlayer({ uri: track.uri }, { updateInterval: UPDATE_MS });
  if (rate !== 1) player.setPlaybackRate(rate);

  player.addListener('playbackStatusUpdate', (status: any) => {
    if (!state) return;
    const playing = !!status.playing;
    /**
     * ⚠️ Fin de piste traitée EN PREMIER et de façon exclusive.
     *
     * Le lecteur continue d'émettre des mises à jour après la fin, avec une position qui
     * peut valoir la durée ou zéro selon la plateforme. Écrire `currentTime` depuis ces
     * relevés effacerait le rembobinage — ou pire, `finished` lui-même — et le vocal
     * redeviendrait impossible à réécouter.
     */
    if (status.didJustFinish) {
      state = { ...state, playing: false, loading: false, finished: true, currentTime: 0 };
      emit();
      return;
    }
    // Une piste terminée ne bouge plus tant qu'on ne l'a pas relancée : on ignore les
    // relevés qui suivent, ils ne portent rien de neuf.
    if (state.finished && !playing) return;

    state = {
      ...state,
      playing,
      currentTime: status.currentTime ?? state.currentTime,
      duration: status.duration || state.duration,
      // Le son sort : l'attente est finie.
      loading: state.loading && !playing,
    };
    emit();
  });

  state = {
    track,
    playing: true,
    finished: false,
    currentTime: 0,
    duration: (track.durationMs ?? 0) / 1000,
    rate,
    loading: true,
  };
  player.play();
  emit();
};

export const pauseVoice = () => {
  if (!player || !state) return;
  player.pause();
  state = { ...state, playing: false, loading: false };
  emit();
};

/** Déplacement dans la piste, en fraction de la durée totale. */
export const seekVoice = (ratio: number) => {
  if (!player || !state?.duration) return;
  player.seekTo(ratio * state.duration);
  // Se déplacer dans une piste terminée la remet en jeu : le prochain appui doit lire à
  // partir de là, pas rembobiner.
  state = { ...state, currentTime: ratio * state.duration, finished: false };
  emit();
};

export const setVoiceRate = (rate: number) => {
  if (!player || !state) return;
  // `pitchCorrectionQuality` par défaut : la voix reste naturelle en accéléré.
  player.setPlaybackRate(rate);
  state = { ...state, rate };
  emit();
};

/** Arrête et oublie la lecture — le mini-player disparaît. */
export const stopVoice = () => {
  dispose();
  state = null;
  emit();
};

/**
 * Lecture en cours, lue HORS rendu (effet, écouteur).
 *
 * ⚠️ Ne pas s'en servir dans un composant pour afficher quoi que ce soit : rien ne le
 * rendrait à nouveau au changement d'état. C'est `useVoicePlayback` qui sert à l'affichage.
 */
export const voiceSnapshot = (): VoiceState | null => state;

/** ⚠️ Le hook RENVOIE la valeur qu'il observe (cf. la note `useMyLiveShare` du CLAUDE.md). */
export const useVoicePlayback = (): VoiceState | null =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
