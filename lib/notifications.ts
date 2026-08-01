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
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
    });
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
