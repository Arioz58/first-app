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
    console.warn("[FCM] Permission refusée");
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
    console.log("[FCM] Token push ignoré (simulateur) — notifs locales OK");
    return null;
  }

  let token: string;
  try {
    token = (await Notifications.getDevicePushTokenAsync()).data;
  } catch (e) {
    // Pas d'entitlement aps-environment (compte Apple gratuit) / push indisponible →
    // on ignore proprement : l'app fonctionne sans notifications push.
    console.warn("[FCM] Token push indisponible :", e);
    return null;
  }

  try {
    await apiRequest("/users/me/fcm-token", {
      method: "POST",
      body: { fcmToken: token },
    });
    console.log("[FCM] Token enregistré");
  } catch (e) {
    console.warn("[FCM] Échec enregistrement token:", e);
  }

  return token;
};
