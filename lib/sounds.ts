import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * Sons d'interface : envoi et réception d'un message.
 *
 * Demande du client (15/09) : « un son quand l'utilisateur envoie le message, comme le
 * principe de WhatsApp — attention ce son doit pouvoir être activé et désactivé, de préférence
 * des sons neutres qui ne seront pas désagréables ».
 *
 * ⚠️ RÉGLAGE LOCAL, comme le thème : on peut vouloir le son sur l'ordinateur et le silence sur
 * le téléphone. Le passer au serveur imposerait un choix unique aux deux, et ce n'est pas une
 * donnée qui a besoin de suivre le compte.
 *
 * ⚠️ Les deux sons sont FOURNIS PAR BERKE (20/09), après deux essais fabriqués ici — des notes
 * puis des woosh de synthèse. Ce sont les siens qui sont en place ; les miens ne sont plus
 * qu'un repli documenté dans le `todo`.
 * ⚠️ BAISSÉS À LA LECTURE, pas dans les fichiers. Mesurés à l'installation, ils sortaient à
 * −4,9 dBFS (envoi) et −3,6 (réception), soit une dizaine de décibels au-dessus d'un son
 * d'interface — Berke les a trouvés trop forts à l'usage. Le gain est donc appliqué par le
 * lecteur : les fichiers restent ceux qu'il a fournis, octet pour octet, rien n'est réencodé
 * (un MP3 réencodé perd en qualité à chaque passage) et le réglage tient en une valeur.
 * ⚠️ 600 ms dont ~400 de silence en fin de fichier : sans conséquence, l'élément audio est
 * simplement occupé plus longtemps, et un second envoi le repositionne à zéro.
 */

const KEY = 'sounds_enabled';

/**
 * ⚠️ Lecteurs créés UNE FOIS et réutilisés, hors de l'arbre React. En créer un par lecture
 * allouerait un objet natif à chaque message envoyé ; et `useAudioPlayer` libère son lecteur
 * au démontage, ce qui couperait le son en quittant l'écran (leçon de `voicePlayback.ts`).
 */
let joueurEnvoi: AudioPlayer | null = null;
let joueurReception: AudioPlayer | null = null;

/**
 * Gain de lecture, un par son.
 *
 * ⚠️ DEUX VALEURS ET NON UNE : les deux fichiers ne sortent pas au même niveau (−4,9 et −3,6
 * dBFS), et un son REÇU plus fort que celui qu'on déclenche soi-même s'entend comme une
 * alerte. Ces gains les ramènent tous deux à environ −13 dBFS de pic, donc au même volume
 * perçu.
 *
 * ⚠️ Échelle LINÉAIRE en amplitude, pas en décibels : 0,39 ne veut pas dire « 39 % du volume »
 * mais environ −8 dB, soit à peu près deux fois moins fort à l'oreille.
 */
const GAIN_ENVOI = 0.39;
const GAIN_RECEPTION = 0.34;

/** Valeur en mémoire : le stockage est asynchrone, et un son ne peut pas attendre. */
let actif = true;
const listeners = new Set<() => void>();

/**
 * Restaure la préférence au démarrage.
 *
 * ⚠️ Sans attendre : à la différence du thème, un son qui n'existe pas encore ne se voit pas.
 * Le défaut (activé) s'applique le temps de la lecture, ce qui n'a aucune conséquence visible
 * — personne n'envoie de message avant que l'application soit montée.
 */
export const initSounds = async () => {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v === '0') {
      actif = false;
      listeners.forEach((l) => l());
    }
  } catch {
    // Trousseau illisible : on reste sur le défaut.
  }
};

export const setSoundsEnabled = (next: boolean) => {
  if (next === actif) return;
  actif = next;
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(KEY, next ? '1' : '0').catch(() => {});
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => actif;

/**
 * ⚠️ Le hook RENVOIE la valeur qu'il observe — même règle que `useThemePref` et
 * `friendRequests` : la relire par un appel externe laisse le compilateur mémoïser, et
 * l'interrupteur resterait figé jusqu'au remontage de l'écran.
 */
export const useSoundsEnabled = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * ⚠️ `seekTo(0)` avant chaque lecture : un lecteur réutilisé reste positionné à la FIN du son
 * précédent, et le second envoi serait donc muet.
 *
 * ⚠️ Tout est avalé : un son qui ne part pas ne doit jamais empêcher l'envoi d'un message.
 */
const jouer = (obtenir: () => AudioPlayer, gain: number) => {
  if (!actif) return;
  try {
    const p = obtenir();
    // ⚠️ Reposé à chaque lecture : le lecteur est réutilisé, et rien ne garantit que le
    // système n'a pas touché à son volume entre-temps (appel entrant, duck audio).
    p.volume = gain;
    p.seekTo(0);
    p.play();
  } catch {
    // Session audio occupée (vocal en cours, appel) : on passe.
  }
};

export const playSent = () =>
  jouer(
    () => (joueurEnvoi ??= createAudioPlayer(require('../assets/sounds/sent.mp3'))),
    GAIN_ENVOI,
  );

/**
 * ⚠️ RÉCEPTION : à ne jouer que lorsque l'application est À L'ÉCRAN. En arrière-plan c'est la
 * notification système qui sonne, et le serveur ne pousse justement QUE dans ce cas — les deux
 * ne peuvent donc pas se superposer. L'appelant n'a rien à vérifier de plus.
 */
export const playReceived = () =>
  jouer(
    () => (joueurReception ??= createAudioPlayer(require('../assets/sounds/received.mp3'))),
    GAIN_RECEPTION,
  );
