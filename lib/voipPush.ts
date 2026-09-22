import { Platform } from 'react-native';
import * as Device from 'expo-device';
import VoipPushNotification from 'react-native-voip-push-notification';
import { apiRequest } from './api';

/**
 * Jeton PushKit : l'adresse à laquelle le serveur fait sonner un téléphone VERROUILLÉ.
 *
 * ⚠️ DISTINCT du jeton de notifications habituel (`lib/notifications.ts`). Apple en délivre
 * deux, ils ne sont pas interchangeables, et se tromper donne un « BadDeviceToken » qui
 * n'explique rien.
 *
 * ⚠️ iOS UNIQUEMENT : Android n'a pas de PushKit. Un appel y arrive par une notification
 * ordinaire à haute priorité, déjà en place côté serveur.
 *
 * ⚠️ Le jeton n'est délivré qu'en réponse à l'enregistrement fait par le code natif
 * (`plugins/withVoipPush.js`) : il arrive donc de façon ASYNCHRONE, peu après le
 * lancement, et non sur demande.
 */

let registered = false;

export const registerVoipPush = () => {
  if (Platform.OS !== 'ios' || !Device.isDevice || registered) return;
  registered = true;

  VoipPushNotification.addEventListener('register', (token: string) => {
    apiRequest('/users/me/voip-token', { method: 'POST', body: { voipToken: token } })
      .then(() => console.log('[voip] Jeton enregistré'))
      .catch((e) => console.warn('[voip] Enregistrement refusé :', e?.message));
  });

  /**
   * ⚠️ L'appel lui-même est déjà affiché par le code NATIF au moment où cet événement
   * arrive : iOS impose de signaler l'appel à CallKit dans le même cycle que le push, bien
   * avant que le JavaScript ne démarre. On ne fait donc rien de plus ici — le socket, en se
   * reconnectant, apportera l'état réel de l'appel.
   */
  VoipPushNotification.addEventListener('notification', () => {});

  // Déclenche la demande de jeton auprès du système.
  VoipPushNotification.registerVoipToken();
};

/**
 * ⚠️ À appeler AVANT d'effacer la session, comme pour le jeton push : sans cela, le compte
 * quitté garde l'adresse de cet appareil et continuerait d'y faire sonner ses appels.
 */
export const unregisterVoipPush = async () => {
  if (Platform.OS !== 'ios') return;
  try {
    await apiRequest('/users/me/voip-token', { method: 'DELETE' });
  } catch {
    // Déconnexion hors ligne : le jeton sera réattribué au prochain compte qui se
    // connectera sur cet appareil (l'enregistrement le retire des autres).
  }
};
