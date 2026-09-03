import { Alert, Linking } from 'react-native';
import i18n from './i18n';

/**
 * Refus d'une permission : le dire, et proposer le SEUL recours qui existe.
 *
 * ⚠️ iOS et Android n'affichent la boîte de dialogue système qu'UNE FOIS. Après un refus,
 * redemander ne produit plus rien — l'unique moyen d'accorder l'accès est de passer par les
 * réglages de l'appareil. Une alerte qui se contente d'annoncer le refus laisse donc
 * l'utilisateur devant une fonction définitivement inutilisable, sans lui dire quoi faire.
 *
 * ⚠️ `openSettings()` ouvre la fiche de l'app, pas la page de la permission : aucune API ne
 * permet d'aller plus loin. D'où le message, qui doit nommer ce qu'on y cherche.
 */
export const permissionDeniedAlert = (title: string, body: string) => {
  Alert.alert(title, body, [
    { text: i18n.t('cancel'), style: 'cancel' },
    { text: i18n.t('camera.open_settings'), onPress: () => Linking.openSettings() },
  ]);
};
