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
  if (!Device.isDevice) {
    console.log(
      "[FCM] Les notifications push nécessitent un appareil physique",
    );
    return null;
  }

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

  const token = (await Notifications.getDevicePushTokenAsync()).data;

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
