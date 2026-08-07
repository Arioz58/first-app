import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Fournit la position du clavier, mesurée nativement image par image, aux écrans qui
// s'y adaptent (barre de saisie du chat).
import { KeyboardProvider } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { setSessionExpiredHandler } from "../lib/api";
import { sheetRecede } from "../lib/sheetRecede";
import {
  incrementPendingFriendRequests,
  refreshPendingFriendRequests,
} from "../lib/friendRequests";
import i18n from "../lib/i18n";
import { registerForPushNotifications } from "../lib/notifications";
// ⚠️ Importé au niveau module, pas dans un effet : la tâche doit être DÉFINIE avant que le
// système ne réveille l'app pour une notification — à ce moment-là aucun composant n'a été
// rendu, et une tâche non définie est simplement perdue.
import { registerDeliveryReceiptTask } from "../lib/deliveryReceipt";
import { connectSocket, pauseSocket, resumeSocket } from "../lib/socket";
import { hydrateLiveShares } from "../lib/liveLocation";
import { clearTokens, getAccessToken, getRefreshToken } from "../lib/storage";
import { initTheme, useThemeColors } from "../lib/theme";
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

// Recul de l'écran quand une feuille s'ouvre (voir `lib/sheetRecede.ts`).
// Échelle : en deçà de 0.90 la barre d'onglets se décolle visiblement du bas et l'écran
// paraît « lâché » plutôt que rangé derrière.
const RECEDE_SCALE = 0.92;
// Coins de l'écran reculé. Calé sur l'arrondi d'un écran d'iPhone récent, pas sur notre
// échelle de surfaces : c'est l'appareil qu'on imite ici, pas une carte de l'app.
const RECEDE_RADIUS = 38;
// Léger enfoncement vers le bas : la feuille arrivant du bas, un recul centré laisserait
// autant de noir en haut qu'en bas et l'écran semblerait flotter.
const RECEDE_LIFT = 10;

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  // Ouverture depuis une notification. Sans cela, taper une notification de message
  // se contentait de lancer l'app sur son dernier écran, sans mener à la conversation.
  useEffect(() => {
    const open = (data?: Record<string, unknown>) => {
      const conversationId = data?.conversationId;
      if (typeof conversationId !== "string") return;
      // La notification porte deja le nom et la photo affiches (`displayName` /
      // `avatarUrl`, poses par le serveur pour l'extension iOS) : les transmettre evite
      // que l'en-tete du chat reste vide le temps du chargement.
      // `senderName` n'est present qu'en groupe — c'est ainsi que l'extension distingue
      // les deux cas, on s'en sert pareillement.
      const name = typeof data?.displayName === "string" ? data.displayName : "";
      const photo = typeof data?.avatarUrl === "string" ? data.avatarUrl : "";
      const type = typeof data?.senderName === "string" ? "group" : "direct";
      router.push({
        pathname: "/chat/[id]" as any,
        params: { id: conversationId, name, photo, type },
      });
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
    // Un partage de position peut avoir survécu à la fermeture de l'app : on reprend le
    // suivi là où il en était, plutôt que de le laisser figé jusqu'à son échéance.
    hydrateLiveShares().catch(() => {});

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
      registerDeliveryReceiptTask();
      refreshPendingFriendRequests();
      setChecked(true);
    };

    init();
  }, []);

  // ⚠️ Le fond d'écran du navigateur est BLANC par défaut, quel que soit le thème : celui
  // de React Navigation est interne et ignore complètement le `dark:` de NativeWind. Tant
  // qu'un écran n'a pas fini de se peindre, c'est ce blanc qu'on voit — un flash à chaque
  // transition en mode sombre. On le cale donc sur la palette de l'app.
  const themeColors = useThemeColors();

  // Piloté sur le thread UI par la feuille ouverte : aucun aller-retour en JS, le recul
  // suit donc le doigt pendant le glissement de fermeture.
  const recedeStyle = useAnimatedStyle(() => {
    const p = sheetRecede.value;
    return {
      transform: [
        { scale: 1 - p * (1 - RECEDE_SCALE) },
        { translateY: p * RECEDE_LIFT },
      ],
      borderRadius: p * RECEDE_RADIUS,
    };
  });

  if (!checked) return null;

  // Fond noir : c'est ce qu'on découvre autour de l'écran une fois qu'il a reculé.
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
    <KeyboardProvider>
    {/* ⚠️ La feuille elle-même n'est PAS ici : elle vit dans un `Modal`, donc au-dessus de
        cette vue et hors de sa transformation — c'est justement ce qui permet de reculer
        l'écran sans reculer la feuille avec. */}
    <Animated.View style={[{ flex: 1, overflow: "hidden" }, recedeStyle]}>
    <Stack screenOptions={{ contentStyle: { backgroundColor: themeColors.canvas } }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/new" options={{ headerShown: false }} />
      <Stack.Screen
        name="chat/live"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
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
      <Stack.Screen
        name="archived"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
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
    </Animated.View>
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
