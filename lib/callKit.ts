import { Platform } from 'react-native';
import * as Device from 'expo-device';
import RNCallKeep from 'react-native-callkeep';

/**
 * L'écran d'appel du SYSTÈME (CallKit sur iOS, ConnectionService sur Android).
 *
 * Demande du client (22/09) : « quand on appelle quelqu'un qui a le téléphone verrouillé,
 * que ça s'affiche comme un appel normal provenant de Nexa, exactement comme WhatsApp ».
 *
 * ⚠️ CE MODULE NE SUFFIT PAS À LUI SEUL pour l'écran verrouillé. Il donne l'écran système
 * tant que l'application TOURNE. Quand elle est fermée, plus rien dans l'application ne
 * peut réagir : c'est le rôle de PushKit, qui réveille le processus à la réception d'un
 * push VoIP et doit signaler l'appel à CallKit dans la foulée. Sans PushKit, un téléphone
 * verrouillé depuis longtemps ne sonnera pas.
 *
 * ⚠️ `react-native-callkeep` n'a plus été publié depuis novembre 2024. Il compile et
 * démarre en New Architecture (vérifié le 22/09), mais c'est une dépendance dormante : à
 * surveiller à chaque montée de version d'Expo.
 */

/**
 * Identifiant de l'appel pour le système.
 *
 * ⚠️ CallKit exige un UUID, et le nôtre en est déjà un — aucune correspondance à tenir
 * entre « l'appel du système » et « l'appel du serveur », ce qui évite toute une classe de
 * désynchronisations.
 */
type Handlers = {
  /** ⚠️ L'identifiant vient du SYSTÈME : c'est parfois la seule trace de l'appel dont
   *  dispose l'application, quand elle vient de démarrer à froid sur un décroché. */
  onAnswer: (callId?: string) => void;
  onEnd: () => void;
  onMute: (muted: boolean) => void;
};

let handlers: Handlers | null = null;
let ready = false;
/** L'appel actuellement connu du système, pour ne jamais en clore un autre. */
let currentUuid: string | null = null;
/** Une fin demandée par l'application, dont l'écho système ne doit pas être suivi. */
let endingOurselves = false;

/**
 * Déclare l'application auprès du système comme une application d'appel.
 *
 * ⚠️ À faire UNE FOIS au démarrage, et non au premier appel : sur iOS, le système doit
 * connaître l'application avant qu'un appel arrive, sinon le premier appel de la session
 * n'affiche rien.
 */
export const setupCallKit = async (): Promise<boolean> => {
  if (ready) return true;
  /**
   * ⚠️ APPAREIL RÉEL UNIQUEMENT. Le simulateur n'a pas de téléphonie : CallKit y accepte
   * `setup` et `displayIncomingCall` sans broncher, n'affiche rien, puis émet un `endCall`
   * — que l'application traduit en raccroché. Résultat mesuré le 22/09 : tout appel était
   * REFUSÉ dans la seconde, sans que rien ne s'affiche.
   *
   * ⚠️ Ne pas remplacer ce test par un `try/catch` : l'échec n'en est pas un, le système
   * répond normalement. Il n'y a que l'absence de téléphonie qui le distingue.
   */
  if (!Device.isDevice) {
    console.log('[callkit] Simulateur : écran système désactivé, repli sur celui de l\'app');
    return false;
  }
  try {
    await RNCallKeep.setup({
      ios: {
        // Ce nom est celui que l'utilisateur lit sur l'écran d'appel et dans l'historique
        // téléphonique du système.
        appName: 'Nexa',
        supportsVideo: false,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
      },
      android: {
        alertTitle: 'Autorisation requise',
        alertDescription: "Nexa a besoin d'accéder à votre compte d'appel",
        cancelButton: 'Annuler',
        okButton: 'Continuer',
        // ⚠️ Déclaré en mode « self-managed » : nos appels ne passent pas par le réseau
        // téléphonique et ne doivent pas apparaître comme des appels GSM.
        selfManaged: true,
        additionalPermissions: [],
        foregroundService: {
          channelId: 'nexa-calls',
          channelName: 'Appels',
          notificationTitle: 'Appel en cours',
        },
      },
    });
    ready = true;
    return true;
  } catch (e) {
    // Autorisation refusée, ou module indisponible : l'application garde son propre écran
    // d'appel. ⚠️ Ne jamais laisser cet échec empêcher un appel — mieux vaut un appel sans
    // écran système qu'aucun appel.
    console.warn('[callkit] Indisponible :', e);
    return false;
  }
};

/** Les actions déclenchées depuis l'écran système reviennent ici. */
export const bindCallKit = (h: Handlers) => {
  handlers = h;
  RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    console.log('[callkit] décroché depuis l\'écran système, uuid =', callUUID);
    currentUuid = callUUID ?? currentUuid;
    handlers?.onAnswer(callUUID);
  });
  RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
    const uuid = callUUID?.toLowerCase();
    /**
     * ⚠️ Une fin qui ne concerne PAS l'appel courant est ignorée : le système garde une
     * trace des appels passés et peut en clore un ancien, ce qui raccrocherait celui qui
     * est en cours.
     */
    if (currentUuid && uuid && uuid !== currentUuid.toLowerCase()) return;
    /**
     * ⚠️ Et surtout : la fin que NOUS venons de demander revient par cet événement. La
     * suivre relancerait `hangUp`, donc `endNativeCall`, donc cet événement — une boucle
     * dont on ne sort pas.
     */
    if (endingOurselves) {
      endingOurselves = false;
      return;
    }
    handlers?.onEnd();
  });
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted }) =>
    handlers?.onMute(muted),
  );
};

/**
 * Fait sonner le téléphone avec l'écran d'appel du système.
 *
 * ⚠️ C'est LE SYSTÈME qui sonne à partir d'ici : l'application ne doit surtout pas jouer sa
 * propre sonnerie en plus, sans quoi on entendrait les deux superposées.
 */
export const displayIncomingCall = (callId: string, callerName: string) => {
  if (!ready) return false;
  try {
    currentUuid = callId;
    RNCallKeep.displayIncomingCall(callId, callerName, callerName, 'generic', false);
    return true;
  } catch {
    return false;
  }
};

/** Un appel sortant, pour qu'il apparaisse dans l'historique téléphonique du système. */
export const startOutgoingCall = (callId: string, calleeName: string) => {
  if (!ready) return;
  try {
    currentUuid = callId;
    RNCallKeep.startCall(callId, calleeName, calleeName, 'generic', false);
  } catch {
    // Sans conséquence : l'appel a lieu, il n'apparaît simplement pas dans l'historique
    // du système.
  }
};

/** Le correspondant a décroché : le système passe l'appel en « en cours ». */
export const reportConnected = (callId: string) => {
  if (!ready) return;
  try {
    RNCallKeep.setCurrentCallActive(callId);
  } catch {
    // L'écran système restera sur « appel en cours » sans chronomètre : sans gravité.
  }
};

/**
 * Referme l'écran système.
 *
 * ⚠️ Indispensable et facile à oublier : si l'application raccroche sans le dire au
 * système, l'écran d'appel RESTE à l'écran, et le téléphone se croit en communication —
 * l'utilisateur se retrouve avec un appel fantôme qu'il ne peut fermer qu'en tuant
 * l'application.
 *
 * ⚠️ Silencieux et rejouable : les chemins de fin se croisent (l'autre raccroche pendant
 * qu'on raccroche).
 */
export const endNativeCall = (callId?: string) => {
  if (!ready) return;
  const uuid = callId ?? currentUuid;
  if (!uuid) return;
  try {
    endingOurselves = true;
    RNCallKeep.endCall(uuid);
  } catch {
    // Déjà clos côté système.
  }
  if (uuid === currentUuid) currentUuid = null;
};

/** Reflète dans l'écran système la sourdine décidée dans l'application, et inversement. */
export const setNativeMuted = (callId: string, muted: boolean) => {
  if (!ready || Platform.OS !== 'ios') return;
  try {
    RNCallKeep.setMutedCall(callId, muted);
  } catch {
    // L'écran système affichera un micro dans le mauvais état : sans gravité.
  }
};
