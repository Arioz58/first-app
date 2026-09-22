import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiRequest } from "./api";
import i18n from "./i18n";
import { clearUnread } from "./unreadMessages";
import * as SecureStore from "expo-secure-store";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Réponse directe depuis la notification, sans ouvrir l'application.
 *
 * ⚠️ L'action n'apparaît QUE si la notification porte cette catégorie : le serveur l'envoie
 * dans son push (`categoryId`, voir `src/lib/push.ts`). Une notification sans catégorie
 * s'affiche normalement, simplement sans champ de réponse — rien ne casse sur les anciennes
 * versions de l'app, qui n'ont pas enregistré la catégorie.
 *
 * ⚠️ Les libellés sont FIGÉS au moment de l'enregistrement, dans la langue de l'app à cet
 * instant. C'est pour cela qu'on réenregistre à chaque démarrage plutôt qu'une fois pour
 * toutes : changer la langue dans le profil doit changer le bouton de la notification.
 */
export const REPLY_CATEGORY = "message";
export const REPLY_ACTION = "reply";

export const registerReplyCategory = async (): Promise<void> => {
  if (Platform.OS === "web") return;
  try {
    await Notifications.setNotificationCategoryAsync(REPLY_CATEGORY, [
      {
        identifier: REPLY_ACTION,
        buttonTitle: i18n.t("notifications.reply_action"),
        textInput: {
          submitButtonTitle: i18n.t("notifications.reply_send"),
          placeholder: i18n.t("notifications.reply_placeholder"),
        },
        options: {
          /**
           * ⚠️ `false` = c'est tout l'intérêt : répondre SANS ouvrir l'application, ce que
           * le client a demandé.
           *
           * ⚠️ Contrepartie documentée par `expo-notifications` : si l'application a été
           * TUÉE (balayée du sélecteur, pas simplement mise en arrière-plan), l'écouteur de
           * réponse ne se déclenche pas et le texte est perdu. Couvrir ce cas demanderait
           * du code natif des deux côtés. À mesurer sur appareil réel avant d'y aller.
           */
          opensAppToForeground: false,
        },
      },
    ]);
  } catch (e) {
    // Catégorie refusée : les notifications s'affichent toujours, sans champ de réponse.
    console.warn("[push] Catégorie de réponse indisponible :", e);
  }
};

/**
 * Envoie la réponse saisie dans la notification.
 *
 * ⚠️ Par l'API REST et NON par le socket : à ce moment précis, l'application est en
 * arrière-plan et son socket est fermé — c'est justement cette fermeture qui fait que la
 * notification existe. Le serveur expose `POST /conversations/:id/messages`, qui passe par
 * la même fonction d'envoi que le socket (alerte, push, accusés compris).
 *
 * ⚠️ On marque aussi la conversation comme LUE : répondre à un message, c'est l'avoir lu,
 * et sans cela la pastille resterait allumée sur une conversation à laquelle on vient de
 * répondre.
 *
 * ⚠️ L'échec est ANNONCÉ, par une notification locale. C'est le seul point de la
 * fonctionnalité où l'utilisateur ne voit rien de ce qui se passe : sans ce retour, un
 * message perdu (réseau coupé au moment de la réponse) le laisserait croire qu'il a
 * répondu.
 */
const HANDLED_REPLY_KEY = "lastHandledReply";

export const sendReplyFromNotification = async (
  conversationId: string,
  text: string,
  notificationId: string,
): Promise<void> => {
  const content = text.trim();
  if (!content) return;

  /**
   * ⚠️ Garde ANTI-DOUBLON, et elle est indispensable.
   *
   * Une réponse déjà traitée reste la « dernière réponse » que le système nous rend au
   * lancement suivant (`getLastNotificationResponseAsync`) : sans cette garde, chaque
   * démarrage à froid renverrait le même message. Naviguer deux fois vers une
   * conversation est sans conséquence ; envoyer deux fois un message ne l'est pas.
   *
   * ⚠️ Persistée et non gardée en mémoire : le cas à couvrir est précisément celui où
   * l'application redémarre.
   */
  try {
    if ((await SecureStore.getItemAsync(HANDLED_REPLY_KEY)) === notificationId) return;
    await SecureStore.setItemAsync(HANDLED_REPLY_KEY, notificationId);
  } catch {
    // Trousseau indisponible : on préfère envoyer que perdre la réponse de l'utilisateur.
  }
  try {
    await apiRequest(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { content },
    });
    await apiRequest(`/conversations/${conversationId}/read`, { method: "POST" }).catch(
      () => {},
    );
    // La pastille de l'onglet et celle de l'icône suivent le même store : sans cela elles
    // garderaient le compte d'avant la réponse jusqu'au prochain passage par la liste.
    clearUnread(conversationId);
  } catch {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t("notifications.reply_failed_title"),
        body: i18n.t("notifications.reply_failed_body"),
        // ⚠️ Pas de catégorie ici : proposer de « répondre » à un échec d'envoi rouvrirait
        // le même chemin sur une notification qui n'appartient à aucune conversation.
        data: { conversationId },
      },
      trigger: null,
    });
  }
};

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
