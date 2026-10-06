import { useSyncExternalStore } from 'react';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  MediaPlayerState,
  type IMediaPlayer,
  type IRtcEngine,
} from 'react-native-agora';
import { Camera } from 'expo-camera';
import * as Device from 'expo-device';
import { apiRequest } from './api';
import { enterIdleMode } from './audioMode';
import { playRingback, playRingtone, stopCallSounds } from './callSounds';
import {
  answerNativeCall,
  displayIncomingCall,
  endNativeCall,
  reportConnected,
  setNativeMuted,
  startOutgoingCall,
} from './callKit';

/**
 * Appels audio, AU NIVEAU DE L'APPLICATION.
 *
 * ⚠️ Le moteur Agora est créé ICI, hors de tout composant — même raison que pour la lecture
 * des vocaux (`voicePlayback.ts`) : un appel doit survivre à la navigation. On doit pouvoir
 * quitter l'écran d'appel pour relire un message sans que la voix se coupe. Un moteur créé
 * dans un écran serait détruit avec lui.
 *
 * ⚠️ Un seul appel à la fois, comme un téléphone. Le serveur le vérifie déjà (« ligne
 * occupée ») ; ici on s'y tient pour ne jamais laisser deux moteurs se disputer le micro.
 */

export type CallPeer = { id: string; name: string; photoUrl?: string | null };

/**
 * Audio ou vidéo. ⚠️ Même canal, même signalisation, même facturation de sonnerie : la
 * vidéo n'est qu'un flux de plus publié dans le canal. D'où un champ, et non un second
 * moteur ou un second cycle de vie.
 */
export type CallType = 'audio' | 'video';

export type CallStatus =
  /** Ça sonne — chez l'autre si l'appel est sortant, chez nous s'il est entrant. */
  | 'ringing'
  /** Décroché : on rejoint le canal, la voix n'est pas encore établie. */
  | 'connecting'
  /** Les deux sont dans le canal, on s'entend. */
  | 'active'
  | 'ended';

export type CallState = {
  callId: string;
  peer: CallPeer;
  direction: 'outgoing' | 'incoming';
  type: CallType;
  status: CallStatus;
  /**
   * Identifiant Agora du correspondant une fois entré dans le canal — c'est lui qu'on donne
   * à la vue vidéo pour afficher SON image. `null` tant qu'il n'est pas là.
   */
  remoteUid: number | null;
  /**
   * Instant du DÉCROCHÉ, pour le chronomètre affiché.
   *
   * ⚠️ Jamais l'instant de l'appel : le serveur compte la durée depuis le décroché lui
   * aussi, et deux comptes différents donneraient un historique en désaccord avec ce que
   * la personne a vu à l'écran.
   */
  startedAt: number | null;
  muted: boolean;
  speaker: boolean;
  /** Motif de fin, une fois l'appel terminé — sert au dernier écran affiché. */
  endedReason?: string;
  /**
   * L'écran d'appel du SYSTÈME a pris cet appel en charge.
   *
   * ⚠️ Sert à ne pas afficher deux interfaces d'appel entrant l'une sur l'autre : celle du
   * système par-dessus la nôtre. Le calque de l'application s'efface alors pendant la
   * sonnerie, et reprend la main au décroché — c'est lui qui porte la sourdine et le
   * haut-parleur.
   */
  nativeUI?: boolean;
  /**
   * L'écran d'appel est RÉDUIT : l'appel continue, et un bandeau vert en haut de
   * l'application permet d'y revenir (`CallBanner`). C'est ce qui permet de retourner au
   * chat pendant un appel — pour lire un message, ou voir la bulle de l'appel en cours.
   */
  minimized?: boolean;
};

let engine: IRtcEngine | null = null;
let state: CallState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;

const patch = (next: Partial<CallState>) => {
  if (!state) return;
  state = { ...state, ...next };
  emit();
};

/**
 * Crée le moteur au PREMIER appel et le garde ensuite.
 *
 * ⚠️ `initialize` est coûteux (il monte la pile audio native) : le refaire à chaque appel
 * ajouterait un délai avant la première sonnerie. On le garde donc en vie entre les appels
 * et on se contente de quitter le canal.
 */
const ensureEngine = (appId: string): IRtcEngine => {
  if (engine) return engine;
  const e = createAgoraRtcEngine();
  e.initialize({ appId, channelProfile: ChannelProfileType.ChannelProfileCommunication });
  e.enableAudio();
  /**
   * ⚠️ La vidéo n'est PAS activée ici : le moteur est partagé entre tous les appels, et
   * l'activer une fois pour toutes allumerait la caméra pendant les appels audio. Elle est
   * allumée et éteinte appel par appel (`startVideo` / `stopVideo`).
   */
  e.registerEventHandler({
    /**
     * Le correspondant est entré dans le canal : c'est à cet instant précis, et pas au
     * décroché, qu'on peut dire que la voix passe.
     */
    onUserJoined: (_c, remoteUid) => {
      remoteCount += 1;
      // ⚠️ Voir la garde de `onUserOffline` : un appel terminé ne se rouvre pas.
      if (state?.status === 'ended') return;
      patch({ status: 'active', startedAt: state?.startedAt ?? Date.now(), remoteUid });
    },
    /**
     * Il est parti.
     *
     * ⚠️ On ne termine pas l'appel ici : le serveur fait foi, et c'est `call_ended` qui
     * clôt. Agora signale aussi ce départ lors d'une coupure réseau passagère, et
     * raccrocher là-dessus couperait un appel qui allait se rétablir.
     *
     * ⚠️ ON NE REPASSE EN « Connexion… » QUE S'IL NE RESTE PLUS PERSONNE. Le faire à chaque
     * `onUserOffline` affichait « Connexion… » pendant une conversation parfaitement
     * établie : Agora émet ce signal pour un décrochage passager, et rien ne le contredit
     * ensuite puisque le correspondant n'a jamais vraiment quitté le canal — donc aucun
     * `onUserJoined` ne vient remettre l'état en place. Signalé par Berke le 22/09.
     */
    /**
     * TRACES DE TEST (24/09), en développement seulement : elles disent si le son du
     * correspondant ARRIVE, s'il est DÉCODÉ, et par quelle sortie il part. C'est ce qui
     * manquait pour diagnostiquer le son à sens unique — on ne savait pas distinguer « rien
     * ne vient » de « ça vient mais ça ne sort pas ». À retirer une fois les appels éprouvés.
     */
    onRemoteAudioStateChanged: (_c, remoteUid, st, reason) => {
      if (__DEV__) console.log('[call] audio distant', { remoteUid, state: st, reason });
    },
    onLocalAudioStateChanged: (_c, st, reason) => {
      if (__DEV__) console.log('[call] audio local', { state: st, reason });
    },
    onAudioRoutingChanged: (routing) => {
      if (__DEV__) console.log('[call] sortie audio', routing);
    },
    onError: (err, msg) => {
      if (__DEV__) console.warn('[call] erreur Agora', err, msg);
    },
    onUserOffline: () => {
      remoteCount = Math.max(0, remoteCount - 1);
      /**
       * ⚠️ UN APPEL TERMINÉ NE REDEVIENT JAMAIS « en cours de connexion ».
       *
       * Ces signaux d'Agora arrivent APRÈS le raccroché — quitter le canal fait
       * évidemment partir le correspondant. Sans cette garde, l'état repassait de
       * « terminé » à « Connexion… » une fraction de seconde après le raccroché : l'écran
       * affichait « Connexion… » au lieu de la durée, et SURTOUT il ne se fermait plus,
       * puisque sa fermeture automatique est déclenchée par l'état « terminé ».
       * Signalé par Berke le 22/09 — régression introduite par le compteur de participants.
       */
      if (state?.status === 'ended') return;
      if (remoteCount === 0) patch({ status: 'connecting', remoteUid: null });
    },
  });
  engine = e;
  return e;
};

/**
 * Nombre de participants distants réellement présents dans le canal.
 *
 * ⚠️ Un COMPTEUR et non un booléen : c'est ce qui permet de distinguer « le correspondant
 * a quitté » de « l'un des signaux d'Agora est passé », et c'est déjà prêt pour un appel à
 * plusieurs.
 */
let remoteCount = 0;

/**
 * Allume la caméra et son aperçu local.
 *
 * ⚠️ Appelé dès que l'appelant lance un appel vidéo, AVANT de rejoindre le canal : on se
 * voit pendant que ça sonne, comme sur WhatsApp. L'aperçu ne publie rien — rien ne part
 * tant qu'on n'a pas rejoint le canal, donc rien n'est facturé pendant la sonnerie.
 */
const startVideo = (appId: string) => {
  const e = ensureEngine(appId);
  e.enableVideo();
  e.startPreview();
};

/**
 * DÉVELOPPEMENT : le simulateur n'a pas de caméra, il publie une vidéo de test à la place.
 *
 * Sans cela, impossible de vérifier avec un seul téléphone qu'un VRAI appareil affiche bien
 * l'image de l'autre : le simulateur n'envoie rien, et il ne dessine pas lui-même la vidéo
 * reçue (constaté le 06/10 — image reçue et décodée, jamais affichée).
 *
 * ⚠️ Jamais en production ni sur un téléphone : `__DEV__` ET simulateur. Extrait de 10 s de
 * « Big Buck Bunny » (Blender Foundation, Creative Commons), joué en boucle.
 */
const SIMULATOR_TEST_VIDEO =
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
const useTestVideo = __DEV__ && !Device.isDevice;
let testPlayer: IMediaPlayer | null = null;

const startTestVideo = (e: IRtcEngine): number => {
  const player = e.createMediaPlayer();
  /**
   * ⚠️ La lecture ne se lance qu'une fois l'ouverture TERMINÉE : avant, le lecteur refuse
   * `play` et `mute` (-3, « pas prêt »). Et `open` plutôt que `openWithMediaSource`, qui
   * renvoyait -2 (argument invalide) avec la même adresse (constaté le 06/10).
   */
  player.registerPlayerSourceObserver({
    onPlayerSourceStateChanged: (st, reason) => {
      if (__DEV__) console.log('[call] vidéo de test', { state: st, reason });
      if (st !== MediaPlayerState.PlayerStateOpenCompleted) return;
      // -1 : en boucle, l'appel peut durer plus longtemps que l'extrait.
      player.setLoopCount(-1);
      // Le son de la vidéo n'est pas publié, mais on le coupe aussi en local.
      player.mute(true);
      player.play();
    },
  });
  player.open(SIMULATOR_TEST_VIDEO, 0);
  testPlayer = player;
  return player.getMediaPlayerId();
};

const stopTestVideo = () => {
  if (!testPlayer) return;
  try {
    testPlayer.stop();
    engine?.destroyMediaPlayer(testPlayer);
  } catch {
    // Lecteur déjà détruit.
  }
  testPlayer = null;
};

/** Éteint la caméra. ⚠️ Silencieux et rejouable, comme `leave` dont il fait partie. */
const stopVideo = () => {
  stopTestVideo();
  try {
    engine?.stopPreview();
    engine?.disableVideo();
    /**
     * ⚠️ DÉTACHER les vues d'Agora. Une vue démontée est recyclée par React Native pour la
     * suivante : si Agora la tient encore pour la sortie de ma caméra (ou de l'image de
     * l'autre), l'appel suivant afficherait deux flux dans la même vue — et l'un des deux
     * jamais. `view: null` est la façon documentée de délier une vue.
     */
    engine?.setupLocalVideo({ uid: 0, view: null });
    if (state?.remoteUid) engine?.setupRemoteVideo({ uid: state.remoteUid, view: null });
  } catch {
    // Moteur jamais créé, ou vidéo déjà éteinte.
  }
};

/**
 * Autorisation caméra, demandée au moment de l'appel vidéo.
 *
 * ⚠️ Indispensable sur ANDROID : Agora n'y demande rien et filmerait du noir. Sur iOS il
 * déclencherait bien la demande lui-même, mais sans qu'on puisse réagir à un refus — d'où
 * une demande explicite des deux côtés.
 */
const ensureCameraPermission = async (): Promise<boolean> => {
  try {
    const r = await Camera.requestCameraPermissionsAsync();
    return r.granted;
  } catch {
    return false;
  }
};

/** Rejoint le canal de l'appel avec le jeton que le serveur vient de remettre. */
const join = (
  info: { appId: string; channel: string; token: string; uid: number },
  type: CallType,
  /** Caméra refusée : on reçoit l'image de l'autre sans publier la sienne. */
  publishCamera = true,
) => {
  const e = ensureEngine(info.appId);
  const video = type === 'video';
  const sendVideo = video && publishCamera;
  if (sendVideo) startVideo(info.appId);
  else if (video) e.enableVideo();
  /**
   * ⚠️ Un appel vidéo part sur le HAUT-PARLEUR : on regarde l'écran, le téléphone n'est
   * pas collé à l'oreille. En audio, l'écouteur reste la sortie par défaut.
   */
  e.setDefaultAudioRouteToSpeakerphone(video);
  // Simulateur en développement : la vidéo de test remplace la caméra absente.
  const testPlayerId = sendVideo && useTestVideo ? startTestVideo(e) : null;
  // Nouveau canal : personne d'autre n'y est encore.
  remoteCount = 0;
  e.joinChannel(info.token, info.channel, info.uid, {
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    // Un appel : tout le monde publie et reçoit.
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
    publishCameraTrack: sendVideo && testPlayerId === null,
    autoSubscribeVideo: video,
    ...(testPlayerId !== null && {
      publishMediaPlayerVideoTrack: true,
      publishMediaPlayerAudioTrack: false,
      publishMediaPlayerId: testPlayerId,
    }),
  });
};

/**
 * Quitte le canal sans détruire le moteur.
 *
 * ⚠️ Silencieux et idempotent : on passe par ici depuis plusieurs chemins (raccroché,
 * `call_ended` reçu, appel refusé) et ils se croisent — les deux appareils raccrochent
 * souvent en même temps.
 */
const leave = () => {
  remoteCount = 0;
  try {
    engine?.leaveChannel();
  } catch {
    // Canal déjà quitté : rien à faire.
  }
  // ⚠️ La caméra s'éteint avec l'appel : laissée allumée, son voyant resterait vert.
  stopVideo();
  // Rendre la session audio : Agora la laisse en mode appel, son sur l'écouteur, et les
  // sons de messages en sortaient presque inaudibles (voir `enterIdleMode`).
  enterIdleMode();
};

/** Ce qu'il faudra pour rejoindre, gardé de côté jusqu'au décroché. */
let pendingJoin: { appId: string; channel: string; token: string; uid: number } | null = null;

/** Lancer un appel. Le retour dit seulement s'il a pu PARTIR, pas s'il aboutira. */
export const startCall = async (
  peer: CallPeer,
  type: CallType = 'audio',
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  if (state && state.status !== 'ended') return { ok: false, reason: 'busy_local' };
  // ⚠️ AVANT de faire sonner chez l'autre : un appel vidéo lancé sans caméra le ferait
  // décrocher sur un écran noir.
  if (type === 'video' && !(await ensureCameraPermission())) {
    return { ok: false, reason: 'camera_denied' };
  }
  try {
    const call = await apiRequest<{
      callId: string;
      appId: string;
      channel: string;
      token: string;
      uid: number;
    }>('/calls', { method: 'POST', body: { receiverId: peer.id, type } });

    state = {
      callId: call.callId,
      peer,
      direction: 'outgoing',
      type,
      status: 'ringing',
      remoteUid: null,
      startedAt: null,
      muted: false,
      speaker: type === 'video',
    };
    emit();
    if (type === 'video') startVideo(call.appId);
    // La tonalité d'attente, dès que le serveur a accepté de faire sonner chez l'autre —
    // pas avant : un appel refusé ne doit pas laisser un « brrr » derrière lui.
    playRingback();
    // L'appel apparaît dans l'historique téléphonique du système. ⚠️ La tonalité reste la
    // NÔTRE : CallKit ne fournit pas de tonalité d'attente pour un appel sortant.
    startOutgoingCall(call.callId, peer.name, type === 'video');
    /**
     * ⚠️ On NE rejoint PAS le canal tout de suite, alors que le jeton est déjà là : Agora
     * facture à la minute et par participant, et une sonnerie sans réponse coûterait
     * autant qu'une conversation. On attend `call_accepted`.
     */
    pendingJoin = call;
    return { ok: true };
  } catch (e: any) {
    /**
     * ⚠️ Le motif se lit sur le CODE HTTP, pas dans le corps : `apiRequest` n'attache que
     * `status` à ses erreurs, et le corps est perdu. Lire `e.body.reason` aurait donné
     * « échec » pour tous les refus, y compris « la personne est déjà en ligne ».
     *
     * ⚠️ Blocage et confidentialité sortent tous deux en 403, et c'est voulu : les
     * distinguer révélerait l'un ou l'autre. Ils donnent donc le même message.
     */
    const status = e?.status as number | undefined;
    const reason =
      status === 409 ? 'busy' : status === 503 ? 'unconfigured' : status === 403 ? 'refused' : 'failed';
    return { ok: false, reason };
  }
};

/** Une sonnerie arrive (event socket `call_incoming`). */
export const incomingCall = (callId: string, peer: CallPeer, type: CallType = 'audio') => {
  // Déjà en ligne : le serveur a normalement refusé l'appel côté appelant, mais deux
  // appels peuvent se croiser. On ignore plutôt que d'écraser l'appel en cours.
  if (state && state.status !== 'ended') return;
  state = {
    callId,
    peer,
    direction: 'incoming',
    type,
    status: 'ringing',
    remoteUid: null,
    startedAt: null,
    muted: false,
    speaker: type === 'video',
  };
  emit();
  /**
   * ⚠️ SI le système prend l'appel en charge, c'est LUI qui sonne — l'application ne doit
   * surtout pas jouer sa sonnerie en plus, on entendrait les deux superposées. Notre
   * sonnerie n'est donc qu'un REPLI, pour le cas où l'écran système n'est pas disponible
   * (autorisation refusée, Android sans compte d'appel, module indisponible).
   */
  const native = displayIncomingCall(callId, peer.name, type === 'video');
  if (native) state = { ...state, nativeUI: true };
  else playRingtone();
  emit();
};

/**
 * Décrocher. Le serveur ne remet le jeton qu'ici.
 *
 * ⚠️ `callIdFromSystem` est le cas le plus important, et le moins évident : quand on
 * décroche depuis l'ÉCRAN VERROUILLÉ, l'application vient de démarrer à froid. C'est le
 * code natif qui a fait sonner, à la réception du push VoIP ; le JavaScript, lui, n'a
 * jamais vu passer d'appel et son état est vide. Sans cet identifiant venu du système, on
 * sortait immédiatement — l'appel ne s'établissait pas et le téléphone de l'appelant
 * continuait de sonner dans le vide.
 */
export const acceptCall = async (callIdFromSystem?: string): Promise<boolean> => {
  /**
   * ⚠️ NORMALISÉ EN MINUSCULES : CallKit rend les UUID en MAJUSCULES, nos identifiants sont
   * en minuscules. Comparés ou utilisés tels quels, ils ne se rejoignent jamais.
   */
  const callId = (callIdFromSystem ?? state?.callId)?.toLowerCase();
  if (!callId) return false;
  // Un appel connu du JavaScript doit être en train de sonner ; un appel connu du seul
  // système n'a pas d'état local à vérifier.
  if (state && state.callId.toLowerCase() === callId) {
    if (state.direction !== 'incoming' || state.status !== 'ringing') return false;
  }
  try {
    const info = await apiRequest<{
      appId: string;
      channel: string;
      token: string;
      uid: number;
      peer: CallPeer;
      type?: string;
    }>(`/calls/${callId}/accept`, { method: 'POST' });
    // ⚠️ Le type fait foi côté SERVEUR : à froid (écran verrouillé), le JavaScript n'a
    // jamais vu la sonnerie et ne sait pas si l'appel était vidéo.
    const type: CallType = info.type === 'video' ? 'video' : 'audio';

    /**
     * L'application démarrée à froid n'a aucun état : on le reconstruit à partir de ce que
     * le serveur vient de renvoyer, sinon l'écran d'appel s'ouvrirait vide.
     */
    if (!state || state.callId.toLowerCase() !== callId) {
      state = {
        callId,
        peer: info.peer,
        direction: 'incoming',
        type,
        status: 'connecting',
        remoteUid: null,
        startedAt: Date.now(),
        muted: false,
        speaker: type === 'video',
        nativeUI: true,
      };
      emit();
    }
    // ⚠️ Avant `join` : Agora prend la session audio en rejoignant le canal, et une
    // sonnerie encore en cours se mêlerait à la conversation.
    stopCallSounds();
    reportConnected(callId);
    patch({ status: 'connecting', startedAt: state?.startedAt ?? Date.now() });
    /**
     * ⚠️ Caméra refusée par l'appelé : l'appel n'est PAS refusé pour autant. Il a décroché,
     * il veut parler — il voit l'autre et se fait entendre, sans être vu.
     */
    const camera = type === 'video' ? await ensureCameraPermission() : true;
    join(info, type, camera);
    return true;
  } catch {
    // L'appel n'existe plus (raccroché pendant qu'on décrochait) : on ferme proprement.
    stopCallSounds();
    endNativeCall(callId);
    patch({ status: 'ended', endedReason: 'gone' });
    return false;
  }
};

/**
 * Décrocher depuis l'APPLICATION — la bulle « Appel en cours… » du chat.
 *
 * Si le système fait sonner l'appel (écran d'appel natif), c'est à lui de décrocher : il
 * coupe sa sonnerie et nous renvoie le décroché par le chemin habituel (`answerCall` →
 * `acceptCall`). Sinon on décroche directement, comme le bouton vert de notre écran.
 */
export const answerFromApp = async (): Promise<boolean> => {
  if (!state || state.direction !== 'incoming' || state.status !== 'ringing') return false;
  if (state.nativeUI && answerNativeCall(state.callId)) return true;
  return acceptCall();
};

/** L'autre a décroché : c'est notre tour de rejoindre le canal. */
export const peerAccepted = () => {
  if (!state || state.direction !== 'outgoing') return;
  stopCallSounds();
  reportConnected(state.callId);
  patch({ status: 'connecting', startedAt: Date.now() });
  if (pendingJoin) {
    join(pendingJoin, state.type);
    pendingJoin = null;
  }
};

/**
 * Raccrocher, refuser, annuler — le même geste, comme côté serveur.
 *
 * ⚠️ On quitte le canal AVANT d'attendre la réponse du serveur : la voix doit s'arrêter au
 * moment où le doigt se lève, pas au retour du réseau.
 */
export const hangUp = async (): Promise<void> => {
  const current = state;
  if (!current) return;
  stopCallSounds();
  // ⚠️ Sans ceci l'écran d'appel du système RESTE affiché et le téléphone se croit en
  // communication : un appel fantôme que l'utilisateur ne peut fermer qu'en tuant l'app.
  endNativeCall(current.callId);
  leave();
  pendingJoin = null;
  patch({ status: 'ended' });
  try {
    await apiRequest(`/calls/${current.callId}/end`, { method: 'POST' });
  } catch {
    // Hors ligne : le balayage serveur clôra l'appel de lui-même au bout d'une minute.
  }
};

/** L'appel a été clos par l'autre bout ou par le serveur (event `call_ended`). */
export const callEnded = (callId: string, reason: string) => {
  if (!state || state.callId !== callId) return;
  stopCallSounds();
  endNativeCall(callId);
  leave();
  pendingJoin = null;
  patch({ status: 'ended', endedReason: reason });
};

/**
 * Efface l'appel terminé.
 *
 * ⚠️ Séparé de la fin : l'écran doit pouvoir afficher « Appel terminé » une seconde avant
 * de disparaître. Effacer l'état au raccroché le ferait sortir sans rien dire.
 */
export const clearCall = () => {
  state = null;
  emit();
};

export const toggleMute = () => {
  if (!state) return;
  const muted = !state.muted;
  engine?.muteLocalAudioStream(muted);
  // L'écran système a son propre bouton micro : les deux doivent dire la même chose.
  setNativeMuted(state.callId, muted);
  patch({ muted });
};

/**
 * Sourdine demandée DEPUIS l'écran système.
 *
 * ⚠️ Distincte de `toggleMute` : celle-ci ne repasse pas l'information au système, qui en
 * est justement l'auteur. Le faire renverrait l'ordre à son émetteur, et certains systèmes
 * bouclent là-dessus.
 */
export const setMutedFromSystem = (muted: boolean) => {
  if (!state) return;
  engine?.muteLocalAudioStream(muted);
  patch({ muted });
};

export const toggleSpeaker = () => {
  if (!state) return;
  const speaker = !state.speaker;
  engine?.setEnableSpeakerphone(speaker);
  patch({ speaker });
};

/**
 * ⚠️ Le hook RENVOIE la valeur qu'il observe, il ne la relit pas par un appel externe.
 * Un hook qui s'abonne puis interroge une fonction voit son affichage FIGÉ : le compilateur
 * React a le droit de mémoïser cet appel sur des arguments qui ne changent pas. C'est
 * exactement le défaut rencontré sur `useMyLiveShare` le 6 août.
 */
/**
 * Réduire l'écran d'appel. ⚠️ Refusé pendant qu'un appel ENTRANT sonne : il faut d'abord
 * répondre ou refuser, sinon la sonnerie continuerait sans écran pour l'arrêter.
 */
export const minimizeCall = () => {
  if (!state || state.status === 'ended') return;
  if (state.direction === 'incoming' && state.status === 'ringing') return;
  patch({ minimized: true });
};

/** Revenir à l'écran d'appel (bandeau vert, ou bulle de l'appel dans le chat). */
export const expandCall = () => {
  if (!state) return;
  patch({ minimized: false });
};

/**
 * Un appel sonne ou est en cours.
 *
 * ⚠️ Lu par les sons de messages, qui ne doivent PAS jouer pendant un appel : un lecteur
 * `expo-audio` qui se termine coupe la session audio de toute l'application — celle d'Agora
 * comprise — et la voix se tairait au premier message reçu.
 */
/** L'appel de ce téléphone, lu hors de React (gestionnaires d'appui). */
export const getCurrentCall = () => state;

export const isCallActive = () => state !== null && state.status !== 'ended';

export const useCall = () => useSyncExternalStore(subscribe, snapshot, snapshot);
