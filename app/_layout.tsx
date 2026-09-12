import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
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
import { bindSocket, connectSocket, pauseSocket, resumeSocket } from "../lib/socket";
import { hydrateLiveShares } from "../lib/liveLocation";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getUserId,
  hydrateLocalSettings,
} from "../lib/storage";
import { BOOT_KEYS, hydrateCache } from "../lib/cache";
import { initTheme, useThemeColors } from "../lib/theme";
import { initHeaderStyle } from "../lib/headerStyle";
import { VoiceMiniPlayer } from "../components/VoiceMiniPlayer";
import { ToastStack } from "../components/ToastStack";
import { showToast } from "../lib/toasts";
import { getActiveConversation } from "../lib/unreadMessages";
import { requestContactsSegment } from "../lib/tabsNav";
import "./globals.css";

// ⚠️ À appeler au niveau MODULE, jamais dans un composant ou un effet : sans cela, le splash
// natif se retire DÈS LE PREMIER RENDU de l'arbre React — et à cet instant ce layout rend
// encore `null`, la décision d'authentification n'étant pas prise. On découvrait donc la vue
// racine native, BLANCHE quel que soit le thème, le temps de deux lectures du trousseau.
// C'est l'éclair blanc entre le splash bleu et l'app.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Fondu à la disparition plutôt qu'une coupure sèche : le splash et le premier écran n'ont ni
// la même couleur ni la même mise en page. ⚠️ `fade` est iOS uniquement ; sur Android le
// splash se retire sans transition (le correctif du blanc, lui, vaut pour les deux).
SplashScreen.setOptions({ fade: true, duration: 250 });

/**
 * Alerte de la personne qui vient d'agir (demande d'ami envoyée, acceptée).
 *
 * ⚠️ Un BANDEAU (`showToast`) et non plus une notification locale programmée
 * (`scheduleNotificationAsync`, jusqu'au 11/09) : une notification système émise alors que
 * l'application est au premier plan dépend du `setNotificationHandler`, s'empile dans le
 * centre de notifications et ne mène nulle part quand on la touche. Le bandeau, lui, ouvre
 * l'écran concerné et disparaît de lui-même.
 */
const socialToast = (actor: { id: string; name: string; photoUrl?: string | null }, body: string) =>
  showToast({
    // Rattachée à la personne et non à une conversation : rien à refermer à l'ouverture d'un
    // chat, la clé sert seulement à distinguer ces alertes des messages.
    key: `friend:${actor.id}`,
    title: actor.name,
    body,
    photoUrl: actor.photoUrl ?? null,
    isGroup: false,
    // Les demandes se traitent dans l'onglet Contacts, segment « Amis ».
    href: "/(tabs)/search",
    onOpen: () => requestContactsSegment("friends"),
  });

type Actor = { id: string; name: string; photoUrl?: string | null };

type ConversationUpdated = {
  conversationId: string;
  message: { senderId: string };
  /**
   * Présent uniquement quand il y a matière à prévenir. C'est le SERVEUR qui tranche : lui
   * seul connaît la sourdine de chaque membre, l'état d'une demande de message et le premier
   * média d'un album. Sans ce champ, l'événement ne sert qu'à la liste des conversations.
   */
  alert?: { title: string; body: string; photoUrl: string | null; isGroup: boolean };
};

/**
 * MESSAGE REÇU PENDANT QUE L'APPLICATION EST OUVERTE.
 *
 * ⚠️ Écouté au niveau de l'APPLICATION et non dans la liste des conversations : celle-ci
 * n'est montée que sur son onglet, alors qu'un message peut arriver depuis n'importe quel
 * écran — et c'est précisément le cas où il faut prévenir.
 *
 * ⚠️ `conversation_updated` (room `user:`) et non `new_message` (room `conv:`) : le second
 * n'arrive qu'à ceux qui ont déjà la conversation ouverte, donc jamais à qui regarde
 * ailleurs.
 *
 * ⚠️ Déclaré au niveau MODULE : l'identité de la fonction doit survivre aux rendus pour que
 * le `off` ciblé retrouve le bon écouteur.
 */
const onConversationUpdated = (p: ConversationUpdated) => {
  if (!p.alert) return;
  // Conversation déjà sous les yeux : le message s'y affiche à l'instant, et un bandeau
  // par-dessus masquerait ce qu'on est en train de lire.
  if (getActiveConversation() === p.conversationId) return;
  showToast({
    key: p.conversationId,
    title: p.alert.title,
    body: p.alert.body,
    photoUrl: p.alert.photoUrl,
    isGroup: p.alert.isGroup,
    href: `/chat/${p.conversationId}`,
  });
};

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
  // Miroir du drapeau, lisible depuis les écouteurs de notification : eux sont posés une
  // fois pour toutes et ne verraient jamais la valeur d'état changer.
  const checkedRef = useRef(false);
  // Conversation à ouvrir dès que le navigateur existe (voir `open` ci-dessous).
  const pendingChat = useRef<Record<string, string> | null>(null);

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
      const params = { id: conversationId, name, photo, type };

      // ⚠️ Lancement À FROID depuis une notification : cette fonction est appelée AVANT que
      // le layout ait rendu quoi que ce soit, donc avant que le navigateur existe — la
      // navigation partait dans le vide et l'app s'ouvrait sur son écran par défaut. On la
      // met de côté, l'effet ci-dessous la rejoue une fois le navigateur monté.
      if (!checkedRef.current) {
        pendingChat.current = params;
        return;
      }
      router.push({ pathname: "/chat/[id]" as any, params });
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

  // Ouverture différée : le navigateur vient d'être monté, la conversation mise de côté
  // pendant le lancement peut enfin s'ouvrir.
  useEffect(() => {
    if (!checked || !pendingChat.current) return;
    const params = pendingChat.current;
    pendingChat.current = null;
    router.push({ pathname: "/chat/[id]" as any, params });
  }, [checked, router]);

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
    // Un partage de position peut avoir survécu à la fermeture de l'app : on reprend le
    // suivi là où il en était, plutôt que de le laisser figé jusqu'à son échéance.
    hydrateLiveShares().catch(() => {});

    /**
     * ⚠️ L'affichage ne dépend QUE de la décision d'authentification.
     *
     * `setChecked(true)` était la DERNIÈRE instruction, après l'ouverture du socket et
     * l'enregistrement du jeton push. Tant que ces deux-là n'avaient pas répondu, le layout
     * rendait `null` — donc rien à l'écran. Et il n'y avait aucun `try` : la moindre erreur
     * de l'un d'eux empêchait `setChecked(true)` d'être atteint, et l'app restait figée sur
     * un écran vide POUR TOUJOURS.
     *
     * Invisible au démarrage normal, où l'app est déjà lancée. Mais un lancement À FROID
     * depuis une notification est précisément le moment où le réseau n'est pas encore
     * établi et où l'enregistrement du jeton peut traîner ou échouer.
     *
     * Tout ce qui n'est pas la décision d'authentification se fait donc APRÈS le rendu, et
     * chaque tâche encaisse son échec de son côté.
     */
    const init = async () => {
      let authenticated = false;
      try {
        // ⚠️ ATTENDU, et non lancé à côté : c'est une lecture du trousseau. Non attendue, le
        // premier écran se peignait en CLAIR puis basculait en sombre une image plus tard —
        // second éclair au lancement, sur les appareils en thème sombre. On est sous le
        // splash à ce moment-là, donc l'attente ne se voit pas.
        await initTheme();
        // ⏳ Temporaire — variante d'en-tête de conversation en cours d'arbitrage.
        // ⚠️ PAS attendu, contrairement au thème : cela ne concerne qu'un écran, qui n'est
        // pas encore monté. L'attendre allongerait le lancement pour rien.
        initHeaderStyle().catch(() => {});
        const token = await getAccessToken();
        const refreshToken = await getRefreshToken();
        const inAuth = segments[0] === "(auth)";

        if (!token) {
          if (!inAuth) router.replace("/(auth)/welcome");
        } else if (isTokenExpired(token) && (!refreshToken || isTokenExpired(refreshToken))) {
          await clearTokens();
          router.replace("/(auth)/welcome");
        } else {
          if (inAuth) router.replace("/(tabs)");
          authenticated = true;
          /**
           * MÉMOIRE LOCALE chargée ICI, sous l'écran de démarrage.
           *
           * ⚠️ ATTENDUE, comme le thème : c'est le seul moment où une lecture disque ne se
           * voit pas, puisqu'on attend déjà le trousseau. Chargée après le premier rendu,
           * elle arriverait trop tard — les écrans auraient déjà décidé d'afficher un
           * indicateur de chargement, et on n'aurait fait que déplacer l'écran vide.
           *
           * ⚠️ Cloisonnée par compte : sans l'identifiant, on risquerait de montrer les
           * conversations du compte précédent sur ce téléphone.
           */
          const me = await getUserId();
          if (me) await hydrateCache(me, [...BOOT_KEYS]).catch(() => {});
          /**
           * ⚠️ Réglages locaux de conversation chargés ici aussi : ils vivent dans le
           * trousseau, dont la lecture est asynchrone. L'écran de conversation se peignait
           * donc avec le fond par défaut avant de basculer sur le fond personnalisé — défaut
           * invisible tant que le fil lui-même se faisait attendre, flagrant depuis qu'il
           * s'affiche instantanément.
           */
          await hydrateLocalSettings().catch(() => {});
        }
      } catch {
        // Trousseau illisible : mieux vaut rendre l'app, quitte à ce qu'un appel échoue
        // ensuite avec son message, que la laisser sur un écran vide.
      } finally {
        checkedRef.current = true;
        setChecked(true);
      }

      if (!authenticated) return;

      connectSocket()
        .then((socket) => {
          /**
           * ⚠️ `bindSocket` et non `socket.on` : le socket survit au rechargement de ce
           * module, et un écouteur rebranché sans retirer le précédent traite l'événement
           * deux fois, puis trois (le même message affichait trois bandeaux). Voir
           * `lib/socket.ts`.
           *
           * ⚠️ Ce qui suit n'a PAS de nettoyage : ces écouteurs vivent aussi longtemps que la
           * session, comme le socket. C'est `bindSocket` qui garantit l'unicité, pas le cycle
           * de vie du composant.
           */
          // Notifications in-app temps réel (demandes d'amis) quand l'app est ouverte.
          bindSocket(socket, "friend_request_received", "root", (p: { from: Actor }) => {
            socialToast(p.from, i18n.t("notifications.friend_request"));
            incrementPendingFriendRequests();
          });
          bindSocket(socket, "friend_request_accepted", "root", (p: { by: Actor }) => {
            socialToast(p.by, i18n.t("notifications.friend_accepted"));
          });

          /**
           * MESSAGE REÇU PENDANT QUE L'APPLICATION EST OUVERTE.
           *
           * ⚠️ Écouté ICI, au niveau de l'application, et non dans la liste des
           * conversations : celle-ci n'est montée que sur son propre onglet, alors qu'un
           * message peut arriver depuis n'importe quel écran — et c'est précisément le cas
           * où il faut prévenir.
           *
           * ⚠️ `conversation_updated` (room `user:`) et non `new_message` (room `conv:`) :
           * le second n'arrive qu'à ceux qui ont la conversation ouverte, donc jamais à qui
           * regarde ailleurs.
           *
           * ⚠️ C'est le SERVEUR qui décide s'il y a matière à alerter (champ `alert`) : lui
           * seul connaît la sourdine de chaque membre, l'état d'une demande de message et le
           * premier média d'un album. Sans alerte, l'événement ne sert qu'à la liste.
           */
          /**
           * ⚠️ Branché sous un NOM (« root ») : la liste des conversations écoute le même
           * événement pour une autre raison, et un `socket.off('conversation_updated')` sans
           * argument détacherait TOUT — quitter l'onglet Discussion aurait emporté celui-ci
           * avec lui, sans le moindre signe.
           *
           * ⚠️ La pastille des non-lus n'est PAS touchée ici : la liste s'en charge déjà, et
           * la compter deux fois la ferait monter par pas de deux.
           */
          bindSocket(socket, "conversation_updated", "root", onConversationUpdated);
        })
        .catch(() => {});
      registerForPushNotifications()
        .then(() => registerDeliveryReceiptTask())
        .catch(() => {});
      refreshPendingFriendRequests();
    };

    init();

    // Filet. `init` pose `checked` dans un `finally`, donc le cas ne devrait pas se produire —
    // mais une lecture du trousseau qui ne répondrait JAMAIS (ni résolution ni rejet) laisserait
    // le splash à l'écran indéfiniment, ce qui serait bien pire que l'éclair qu'on corrige.
    const safety = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 3000);
    return () => clearTimeout(safety);
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
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: "#000" }}
      // ⚠️ Retrait du splash accroché à `onLayout` de la racine, et non à un effet sur
      // `checked` : un effet s'exécute après le commit React, mais rien ne garantit que la
      // vue ait été POSÉE — on rouvrirait la fenêtre blanche qu'on vient de fermer, en plus
      // court. `onLayout` ne se déclenche qu'une fois la racine mesurée et montée.
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}
    >
    <KeyboardProvider>
    {/* ⚠️ La feuille elle-même n'est PAS ici : elle vit dans un `Modal`, donc au-dessus de
        cette vue et hors de sa transformation — c'est justement ce qui permet de reculer
        l'écran sans reculer la feuille avec. */}
    <Animated.View style={[{ flex: 1, overflow: "hidden" }, recedeStyle]}>
    {/* ⚠️ Hors du `Stack` : un vocal doit continuer d'être signalé quand on QUITTE la
        conversation où il joue — monté dans un écran, ce rappel disparaîtrait avec lui. */}
    <VoiceMiniPlayer />
    {/* ⚠️ Hors du `Stack`, pour la même raison : une alerte annonce ce qui se passe
        AILLEURS que sur l'écran courant, elle ne peut donc pas appartenir à un écran. */}
    <ToastStack />
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
      <Stack.Screen
        name="web-login"
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
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
      {/* Dernière étape de l'inscription : ce que l'app demandera, et pourquoi.
          ⚠️ Pas de retour en arrière (`gestureEnabled: false`) — le compte est créé, revenir
          à la saisie du code n'aurait aucun sens. */}
      <Stack.Screen
        name="permissions"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      {/* Raccourci appareil photo de l'onglet Discussion. ⚠️ Sans en-tête : la caméra est
          plein écran et porte ses propres commandes (fermer, flash, objectif). */}
      <Stack.Screen
        name="capture"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
    </Stack>
    </Animated.View>
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
