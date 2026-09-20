import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiRequest } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const registerForPushNotifications = async (): Promise<
  string | null
> => {
  // Permission demandée partout (nécessaire aussi pour les notifs locales in-app, simulateur inclus).
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[push] Permission refusée");
    return null;
  }

  if (Platform.OS === "android") {
    /**
     * ⚠️ NOUVEAU CANAL, et pas une modification de l'ancien : Android REFUSE de changer le son
     * d'un canal déjà créé. Le réglage appartient à l'utilisateur une fois le canal posé, et
     * `setNotificationChannelAsync` sur un identifiant existant ignore silencieusement le
     * nouveau son. Les appareils qui ont déjà installé l'app seraient donc restés sur le son
     * système, sans que rien ne le signale.
     *
     * ⚠️ `sound` sans extension : Android nomme la ressource d'après le fichier déposé dans
     * `res/raw` par le plugin `expo-notifications`, et une ressource ne porte pas son
     * extension. Sur iOS, à l'inverse, le serveur envoie bien `notification.wav`.
     */
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.MAX,
      sound: "notification",
    });
    // L'ancien canal n'a plus d'emploi : le laisser afficherait deux entrées dans les
    // réglages système, dont une qui ne sert plus à rien.
    await Notifications.deleteNotificationChannelAsync("default").catch(() => {});
  }

  // Le token push REMOTE nécessite un vrai appareil (les notifs locales marchent quand même).
  if (!Device.isDevice) {
    console.log("[push] Jeton ignoré (simulateur) — notifs locales OK");
    return null;
  }

  // ⚠️ Jeton EXPO (`ExponentPushToken[…]`), et non le jeton natif de l'appareil.
  // `getDevicePushTokenAsync()` renvoie sur iOS un jeton APNs, que le service push
  // n'accepte pas : les envois échouaient et le serveur purgeait le jeton au passage.
  // Le service Expo, lui, relaie ensuite vers Apple et Google avec ses propres clés.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    // Build sans identifiants push (entitlement aps-environment absent) → l'app
    // continue de fonctionner, seules les notifications distantes sont indisponibles.
    console.warn("[push] Jeton indisponible :", e);
    return null;
  }

  try {
    await apiRequest("/users/me/fcm-token", {
      method: "POST",
      body: { fcmToken: token },
    });
    console.log("[push] Jeton enregistré");
  } catch (e) {
    console.warn("[push] Échec enregistrement du jeton :", e);
  }

  return token;
};

/**
 * Libère le jeton push du compte courant.
 *
 * ⚠️ À appeler AVANT d'effacer la session, sinon la requête part sans authentification.
 * Sans cela, le compte quitté garde le jeton de l'appareil en base : le serveur continue
 * de lui envoyer des notifications, qui atterrissent sur ce téléphone — y compris pour
 * des messages qu'on vient d'envoyer soi-même depuis un autre compte.
 */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    await apiRequest("/users/me/fcm-token", { method: "DELETE" });
  } catch {
    // Déconnexion hors ligne : le serveur réattribuera le jeton au prochain compte qui
    // se connectera sur cet appareil (l'enregistrement le retire des autres comptes).
  }
};
