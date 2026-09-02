import { createContext, useContext } from 'react';

/**
 * Geste de glissement de la bulle courante, exposé à ses enfants.
 *
 * ⚠️ Un contexte plutôt qu'une chaîne de props : l'onde d'un vocal est à quatre niveaux de
 * la bulle (`MessageEnter` → bulle → `MessageMedia` → `AudioMessage` → `VoiceWaveform`), et
 * faire descendre une référence de geste à travers tout ça pour un seul usage encombrerait
 * quatre signatures.
 *
 * ⚠️ Il sert à `blocksExternalGesture` : la bulle et l'onde portent toutes deux un `Pan`
 * HORIZONTAL, et sans arbitrage explicite le parent l'emporte — glisser dans un vocal pour
 * s'y déplacer déclenchait la réponse en citation.
 *
 * ⚠️ Le tableau vide est une CONSTANTE partagée : recréé à chaque rendu, il changerait
 * l'identité de la valeur du contexte et re-rendrait tous les consommateurs.
 */
export const EMPTY_GESTURES: any[] = [];

export const BubbleGestureContext = createContext<any[]>(EMPTY_GESTURES);

/** Gestes de la bulle englobante, à passer à `blocksExternalGesture`. */
export const useBubbleGestures = () => useContext(BubbleGestureContext);
