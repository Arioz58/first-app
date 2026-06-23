import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { setSessionExpiredHandler } from "../lib/api";
import i18n from "../lib/i18n";
import { registerForPushNotifications } from "../lib/notifications";
import { connectSocket } from "../lib/socket";
import { clearTokens, getAccessToken, getRefreshToken } from "../lib/storage";
import "./globals.css";

// Notif in-app locale (utilisateur en ligne → reçoit l'event socket plutôt qu'un push).
const localNotify = (title: string, body: string) =>
  Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(
    () => {},
  );

const isTokenExpired = (token: string): boolean => {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => router.replace("/(auth)/welcome"));

    const init = async () => {
      const token = await getAccessToken();
      const refreshToken = await getRefreshToken();
      const inAuth = segments[0] === "(auth)";

      if (!token) {
        if (!inAuth) router.replace("/(auth)/welcome");
        setChecked(true);
        return;
      }

      const accessExpired = isTokenExpired(token);
      const refreshExpired = !refreshToken || isTokenExpired(refreshToken);

      if (accessExpired && refreshExpired) {
        await clearTokens();
        router.replace("/(auth)/welcome");
        setChecked(true);
        return;
      }

      if (inAuth) router.replace("/(tabs)");
      const socket = await connectSocket();
      // Notifications in-app temps réel (demandes d'amis) quand l'app est ouverte.
      socket.off("friend_request_received");
      socket.on("friend_request_received", (p: { from: { name: string } }) => {
        localNotify(p.from.name, i18n.t("notifications.friend_request"));
      });
      socket.off("friend_request_accepted");
      socket.on("friend_request_accepted", (p: { by: { name: string } }) => {
        localNotify(p.by.name, i18n.t("notifications.friend_accepted"));
      });
      await registerForPushNotifications();
      setChecked(true);
    };

    init();
  }, []);

  if (!checked) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="blocked" options={{ headerShown: false }} />
      <Stack.Screen name="requests" options={{ headerShown: false }} />
      <Stack.Screen name="group/new" options={{ headerShown: false }} />
      <Stack.Screen
        name="story/[id]"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="story/create" options={{ headerShown: false }} />
    </Stack>
    </GestureHandlerRootView>
  );
}
