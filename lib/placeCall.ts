import type { TFunction } from 'i18next';
import { Alert } from 'react-native';
import { startCall, type CallPeer, type CallType } from './callEngine';

/**
 * Lance un appel depuis un écran qui n'est pas le chat (fiche de détails, profil — 29/10) et
 * annonce un refus. L'appel lui-même s'affiche par `CallOverlay`, monté au niveau de l'app :
 * rien à faire de plus ici.
 *
 * ⚠️ Blocage et confidentialité donnent le MÊME message (`refused`) : les distinguer
 * apprendrait à l'appelant qu'il a été bloqué.
 */
export const placeCall = async (peer: CallPeer, type: CallType, t: TFunction) => {
  const r = await startCall(peer, type);
  if (r.ok) return;
  Alert.alert(
    '',
    r.reason === 'busy'
      ? t('calls.peer_busy')
      : r.reason === 'unconfigured'
        ? t('calls.unavailable')
        : r.reason === 'refused'
          ? t('details.call_unavailable')
          : r.reason === 'camera_denied'
            ? t('calls.camera_denied')
            : t('calls.failed'),
  );
};
