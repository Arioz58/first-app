import { useSyncExternalStore } from 'react';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type IRtcEngine,
} from 'react-native-agora';
import { apiRequest } from './api';

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
  status: CallStatus;
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
  // Appel vocal : on n'active jamais la vidéo, elle allumerait la caméra.
  e.enableAudio();
  e.registerEventHandler({
    /**
     * Le correspondant est entré dans le canal : c'est à cet instant précis, et pas au
     * décroché, qu'on peut dire que la voix passe.
     */
    onUserJoined: () => patch({ status: 'active', startedAt: state?.startedAt ?? Date.now() }),
    /**
     * Il est parti. ⚠️ On ne termine pas l'appel ici : le serveur fait foi, et c'est
     * `call_ended` qui clôt. Agora signale aussi ce départ lors d'une coupure réseau
     * passagère, et raccrocher là-dessus couperait un appel qui allait se rétablir.
     */
    onUserOffline: () => patch({ status: 'connecting' }),
  });
  engine = e;
  return e;
};

/** Rejoint le canal de l'appel avec le jeton que le serveur vient de remettre. */
const join = (info: { appId: string; channel: string; token: string; uid: number }) => {
  const e = ensureEngine(info.appId);
  e.joinChannel(info.token, info.channel, info.uid, {
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    // Un appel : tout le monde publie et reçoit.
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
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
  try {
    engine?.leaveChannel();
  } catch {
    // Canal déjà quitté : rien à faire.
  }
};

/** Ce qu'il faudra pour rejoindre, gardé de côté jusqu'au décroché. */
let pendingJoin: { appId: string; channel: string; token: string; uid: number } | null = null;

/** Lancer un appel. Le retour dit seulement s'il a pu PARTIR, pas s'il aboutira. */
export const startCall = async (
  peer: CallPeer,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  if (state && state.status !== 'ended') return { ok: false, reason: 'busy_local' };
  try {
    const call = await apiRequest<{
      callId: string;
      appId: string;
      channel: string;
      token: string;
      uid: number;
    }>('/calls', { method: 'POST', body: { receiverId: peer.id, type: 'audio' } });

    state = {
      callId: call.callId,
      peer,
      direction: 'outgoing',
      status: 'ringing',
      startedAt: null,
      muted: false,
      speaker: false,
    };
    emit();
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
export const incomingCall = (callId: string, peer: CallPeer) => {
  // Déjà en ligne : le serveur a normalement refusé l'appel côté appelant, mais deux
  // appels peuvent se croiser. On ignore plutôt que d'écraser l'appel en cours.
  if (state && state.status !== 'ended') return;
  state = {
    callId,
    peer,
    direction: 'incoming',
    status: 'ringing',
    startedAt: null,
    muted: false,
    speaker: false,
  };
  emit();
};

/** Décrocher : le serveur ne remet le jeton qu'ici. */
export const acceptCall = async (): Promise<boolean> => {
  if (!state || state.direction !== 'incoming' || state.status !== 'ringing') return false;
  try {
    const info = await apiRequest<{
      appId: string;
      channel: string;
      token: string;
      uid: number;
    }>(`/calls/${state.callId}/accept`, { method: 'POST' });
    patch({ status: 'connecting', startedAt: Date.now() });
    join(info);
    return true;
  } catch {
    // L'appel n'existe plus (raccroché pendant qu'on décrochait) : on ferme proprement.
    patch({ status: 'ended', endedReason: 'gone' });
    return false;
  }
};

/** L'autre a décroché : c'est notre tour de rejoindre le canal. */
export const peerAccepted = () => {
  if (!state || state.direction !== 'outgoing') return;
  patch({ status: 'connecting', startedAt: Date.now() });
  if (pendingJoin) {
    join(pendingJoin);
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
export const useCall = () => useSyncExternalStore(subscribe, snapshot, snapshot);
