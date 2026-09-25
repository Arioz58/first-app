import { setAudioModeAsync } from 'expo-audio';

/**
 * Session audio en LECTURE : le son sort par le haut-parleur principal.
 *
 * ⚠️ À rappeler après tout enregistrement. Sur iOS, `allowsRecording: true` bascule
 * AVAudioSession en `PlayAndRecord`, dont la sortie par défaut est l'écouteur
 * téléphonique — le son devient alors très faible, comme pendant un appel. Le mode reste
 * en place tant qu'on ne le change pas : un vocal enregistré puis relu se retrouve dans
 * l'écouteur, et les vidéos lues ensuite aussi.
 */
export const enterPlaybackMode = () =>
  setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false, // iOS : repasse en Playback (haut-parleur)
    shouldRouteThroughEarpiece: false, // Android : équivalent explicite
  }).catch(() => {});

/** Session audio en CAPTURE micro (à refermer avec `enterPlaybackMode`). */
export const enterRecordingMode = () =>
  setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  }).catch(() => {});

/**
 * Session audio RENDUE après un appel : l'état qu'avait l'application à son démarrage.
 *
 * ⚠️ Indispensable : Agora laisse la session en mode appel (`PlayAndRecord`, sortie sur
 * l'ÉCOUTEUR) après avoir quitté le canal, et personne ne la reprenait. Les sons d'envoi et
 * de réception sortaient alors presque inaudibles — c'est le « les sons de messages ont
 * disparu » signalé par le client le 24/09.
 *
 * ⚠️ `playsInSilentMode: false` + `doNotMix` = catégorie `SoloAmbient`, celle qu'iOS donne
 * par défaut à une application : les sons d'interface RESPECTENT le bouton silencieux, comme
 * chez WhatsApp. Choix validé par Berke le 24/09. Les vocaux, eux, reposent leur propre mode
 * (`enterPlaybackMode`) avant de jouer.
 */
export const enterIdleMode = () =>
  setAudioModeAsync({
    playsInSilentMode: false,
    allowsRecording: false,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  }).catch(() => {});
