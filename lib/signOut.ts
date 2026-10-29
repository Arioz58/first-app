import { apiRequest } from './api';
import { clearCache } from './cache';
import { stopAllLiveShares } from './liveLocation';
import { unregisterPushToken } from './notifications';
import { disconnectSocket } from './socket';
import { clearTokens, getRefreshToken } from './storage';
import { clearToasts } from './toasts';
import { setUnreadCounts } from './unreadMessages';
import { unregisterVoipPush } from './voipPush';

/**
 * Déconnexion. `everywhere` = « Déconnecter tous mes appareils » (téléphone perdu ou volé).
 * Partagée par le profil (déconnexion) et « Appareils connectés » (tous les appareils).
 *
 * ⚠️ Dans ce cas, le serveur est prévenu EN PREMIER et c'est lui qui oublie les jetons push et
 * VoIP et arrête les partages de position : une fois toutes les sessions fermées, cet appareil
 * ne pourrait plus le demander lui-même. S'il échoue, on ne touche à RIEN — l'utilisateur
 * doit savoir que l'autre téléphone est toujours connecté : la fonction rend alors `false`.
 *
 * ⚠️ La navigation vers l'accueil reste à l'appelant (il a le routeur).
 */
export const signOut = async (everywhere: boolean): Promise<boolean> => {
  if (everywhere) {
    try {
      await apiRequest('/auth/logout-all', { method: 'POST' });
    } catch {
      return false;
    }
  } else {
    // Avant d'effacer la session : la requête a besoin du jeton d'accès, et
    // l'appareil ne doit plus recevoir les notifications de ce compte.
    await unregisterPushToken();
    // ⚠️ Le jeton VoIP aussi : sans cela, le compte quitté garde l'adresse de cet
    // appareil et continuerait d'y faire sonner ses appels.
    await unregisterVoipPush();
  }
  // Aucun partage de position ne doit survivre au changement de compte. Attendu :
  // l'arrêt prévient le serveur et coupe le suivi, deux choses qui ont besoin de la
  // session encore valide.
  await stopAllLiveShares();
  // Les non-lus du compte quitté ne doivent pas rester sur l'icône de l'app.
  setUnreadCounts({});
  // Ni ses bandeaux d'alerte à l'écran, qui mèneraient à des conversations
  // devenues inaccessibles.
  clearToasts();
  // ⚠️ La mémoire locale part AVEC le compte : elle contient ses conversations et le
  // texte de ses derniers messages. Attendue, et avant d'effacer la session — le
  // cache est cloisonné par identifiant, qu'il faut donc encore connaître.
  await clearCache();
  disconnectSocket();
  /**
   * ⚠️ Ferme la session CÔTÉ SERVEUR (23/10) : effacer les jetons du téléphone ne suffisait
   * pas, une copie du jeton restait utilisable 7 jours. Sans `auth` : c'est le jeton de
   * rafraîchissement qui désigne la session. Échec ignoré (hors ligne) — on se déconnecte
   * quand même, la session expirera seule.
   */
  if (!everywhere) {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await apiRequest('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(
        () => {},
      );
    }
  }
  await clearTokens();
  return true;
};
