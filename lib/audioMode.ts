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
