import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';

/**
 * Sons d'un appel : la tonalité qu'entend celui qui appelle, la sonnerie qu'entend celui
 * qu'on appelle.
 *
 * ⚠️ SÉPARÉ de `lib/sounds.ts`, et ce n'est pas un détail d'organisation : ce module-là est
 * soumis à l'interrupteur « sons des messages ». Un appel n'est pas un message — couper les
 * sons de messagerie ne doit pas rendre un téléphone muet quand quelqu'un appelle.
 *
 * ⚠️ Les deux fichiers sont FABRIQUÉS ici, comme les premiers woosh : rien n'est emprunté,
 * donc aucune licence à justifier le jour de la mise en production.
 *   ringback : 425 Hz, 2 s de son puis 4 s de silence — la fréquence et la cadence
 *              européennes (et turques). C'est ce motif, pas le timbre, qui fait reconnaître
 *              « ça sonne chez l'autre ».
 *   ringtone : trois notes montantes (ré, fa♯, la) répétées puis un silence. Consigne du
 *              client sur les sons : neutres, pas désagréables.
 *
 * ⚠️ Les deux tournent EN BOUCLE NATIVE (`loop`) et non par un minuteur JavaScript : le
 * silence fait partie du fichier, donc la cadence ne dérive pas et ne dépend pas du fil JS,
 * qui est occupé ailleurs pendant l'établissement d'un appel.
 */

/**
 * Gains de lecture, posés à chaque lecture comme dans `lib/sounds.ts`.
 *
 * ⚠️ La sonnerie est plus forte que la tonalité, volontairement : l'une doit faire se
 * retourner quelqu'un qui n'attend rien, l'autre se contente d'occuper l'oreille de celui
 * qui vient d'appuyer sur un bouton et qui sait déjà ce qui se passe.
 */
const GAIN_TONALITE = 0.5;
const GAIN_SONNERIE = 0.8;

/**
 * Vibration de l'appel entrant : ~1 s de vibration, ~2 s de pause, en boucle.
 *
 * ⚠️ Elle accompagne la sonnerie et ne la remplace pas — mais c'est elle qui reste quand le
 * téléphone est en silencieux, exactement comme pour un appel téléphonique.
 */
const MOTIF_VIBRATION = [0, 1000, 2000];

let tonalite: AudioPlayer | null = null;
let sonnerie: AudioPlayer | null = null;

/**
 * ⚠️ Lecteurs créés à la première utilisation et gardés ensuite, hors de l'arbre React —
 * même raison que partout ailleurs dans ce projet : `useAudioPlayer` libère son lecteur au
 * démontage du composant, et l'écran d'appel se démonte précisément quand l'appel se
 * termine.
 */
const jouer = (
  obtenir: () => AudioPlayer,
  gain: number,
): AudioPlayer | null => {
  try {
    const p = obtenir();
    p.loop = true;
    p.volume = gain;
    // Un lecteur réutilisé reste positionné à la fin du son précédent : sans ceci, le
    // deuxième appel serait muet.
    p.seekTo(0);
    p.play();
    return p;
  } catch {
    // Session audio indisponible : un appel ne doit jamais échouer parce qu'un son n'a pas
    // pu sortir.
    return null;
  }
};

const arreter = (p: AudioPlayer | null) => {
  if (!p) return;
  try {
    p.pause();
    p.seekTo(0);
  } catch {
    // Lecteur déjà libéré.
  }
};

/** La tonalité d'attente, côté appelant. */
export const playRingback = () => {
  tonalite = jouer(
    () => (tonalite ??= createAudioPlayer(require('../assets/sounds/ringback.wav'))),
    GAIN_TONALITE,
  );
};

/** La sonnerie et la vibration, côté appelé. */
export const playRingtone = () => {
  sonnerie = jouer(
    () => (sonnerie ??= createAudioPlayer(require('../assets/sounds/ringtone.wav'))),
    GAIN_SONNERIE,
  );
  try {
    Vibration.vibrate(MOTIF_VIBRATION, true);
  } catch {
    // Appareil sans vibreur (simulateur) : sans conséquence.
  }
};

/**
 * Coupe tout.
 *
 * ⚠️ Appelé depuis PLUSIEURS chemins qui se croisent — décroché, raccroché, refus, fin
 * décidée par le serveur — et il faut donc qu'il soit indolore de l'appeler deux fois, ou
 * alors qu'aucun son ne joue. Un son d'appel qui survit à l'appel est le pire défaut
 * possible de cette fonctionnalité : il continue par-dessus la conversation.
 */
export const stopCallSounds = () => {
  arreter(tonalite);
  arreter(sonnerie);
  try {
    Vibration.cancel();
  } catch {
    // Rien à annuler.
  }
};
