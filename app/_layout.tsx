import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Fournit la position du clavier, mesurée nativement image par image, aux écrans qui
// s'y adaptent (barre de saisie du chat).
import { KeyboardProvider } from "react-native-keyboard-controller";
import { setSessionExpiredHandler } from "../lib/api";
import {
  incrementPendingFriendRequests,
  refreshPendingFriendRequests,
} from "../lib/friendRequests";
import i18n from "../lib/i18n";
import { registerForPushNotifications } from "../lib/notifications";
import { connectSocket, pauseSocket, resumeSocket } from "../lib/socket";
import { clearTokens, getAccessToken, getRefreshToken } from "../lib/storage";
import { initTheme } from "../lib/theme";
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

  // Ouverture depuis une notification. Sans cela, taper une notification de message
  // se contentait de lancer l'app sur son dernier écran, sans mener à la conversation.
  useEffect(() => {
    const open = (data?: Record<string, unknown>) => {
      const conversationId = data?.conversationId;
      if (typeof conversationId === "string") router.push(`/chat/${conversationId}`);
    };

    // App lancée DEPUIS la notification (elle était fermée) : l'événement est déjà passé
    // quand ce composant se monte, il faut donc le récupérer a posteriori.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) open(response.notification.request.content.data);
      })
      .catch(() => {});

    // App déjà lancée (arrière-plan ou premier plan).
    const sub = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification.request.content.data),
    );
    return () => sub.remove();
  }, [router]);

  // Le serveur ne notifie que les utilisateurs hors ligne : on ferme donc le socket dès
  // que l'app passe en arrière-plan, plutôt que d'attendre que la coupure se voie d'elle-même
  // (quelques secondes pendant lesquelles les messages n'étaient ni affichés ni notifiés).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      // « inactive » = bascule d'app, centre de contrôle, appel entrant : l'utilisateur
      // est encore devant l'app, on ne coupe pas pour si peu.
      if (state === "background") pauseSocket();
      else if (state === "active") resumeSocket();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => router.replace("/(auth)/welcome"));
    initTheme(); // restaure le thème choisi (Système/Clair/Sombre) avant le rendu

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
        incrementPendingFriendRequests();
      });
      socket.off("friend_request_accepted");
      socket.on("friend_request_accepted", (p: { by: { name: string } }) => {
        localNotify(p.by.name, i18n.t("notifications.friend_accepted"));
      });
      await registerForPushNotifications();
      refreshPendingFriendRequests();
      setChecked(true);
    };

    init();
  }, []);

  if (!checked) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <KeyboardProvider>
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/new" options={{ headerShown: false }} />
      <Stack.Screen
        name="chat/details"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="chat/media"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="blocked" options={{ headerShown: false }} />
      <Stack.Screen name="requests" options={{ headerShown: false }} />
      <Stack.Screen name="group/new" options={{ headerShown: false }} />
      <Stack.Screen name="group/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
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
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
