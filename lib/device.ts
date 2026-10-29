import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Description de CET appareil, envoyée à la connexion et à chaque renouvellement du jeton
 * (29/10) : c'est elle que l'écran « Appareils connectés » affiche (« iPhone 15 Pro · iOS 18.1 »).
 *
 * ⚠️ Le MODÈLE et non le nom donné par l'utilisateur (`Device.deviceName`, « iPhone de Berke ») :
 * celui-ci contient souvent un prénom, et il partirait au serveur. Le modèle suffit à
 * reconnaître son appareil.
 * ⚠️ Purement descriptive : le serveur ne s'en sert pour rien décider.
 */
export const deviceInfo = () => ({
  platform: Platform.OS,
  deviceModel: Device.modelName ?? null,
  osName: [Device.osName, Device.osVersion].filter(Boolean).join(' ') || null,
});
