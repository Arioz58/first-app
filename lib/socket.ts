import { io, Socket } from "socket.io-client";
import { refreshAccessToken } from "./api";
import { BASE_URL } from "./config";
import { getAccessToken } from "./storage";

/**
 * ⚠️ Copie locale plutôt qu'un import : `app/_layout.tsx` porte la même, et la partager
 * demanderait un module de plus pour six lignes. Un jeton illisible est traité comme expiré —
 * c'est le cas le plus sûr, il déclenche un renouvellement au lieu d'un échec muet.
 */
const isTokenExpired = (token: string): boolean => {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)).exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

let socket: Socket | null = null;

export const connectSocket = async (): Promise<Socket> => {
  // ⚠️ Réutiliser l'instance existante même déconnectée (app en arrière-plan, handshake en
  // cours) : en créer une seconde laisserait la première vivante avec tous les écouteurs
  // déjà posés par les écrans — messages en double d'un côté, écran muet de l'autre.
  if (socket) {
    await resumeSocket();
    return socket;
  }

  const token = await getAccessToken();

  socket = io(BASE_URL, {
    // ⚠️ `platform` dit au serveur à quel type d'appareil il parle : lui seul décide
    // ensuite s'il faut pousser une notification. Un socket mobile ouvert signifie « app
    // affichée » (elle se déconnecte en arrière-plan), un socket web ne signifie rien de
    // tel — un onglet oublié rendait le téléphone muet.
    auth: { token, platform: "mobile" },
    transports: ["websocket"],
    reconnection: true,
  });

  socket.on("connect", () => console.log("[Socket] Connecté"));
  socket.on("disconnect", () => console.log("[Socket] Déconnecté"));

  /**
   * Handshake refusé : on renouvelle le jeton et on RELANCE la connexion.
   *
   * ⚠️ MESURÉ le 11/09 sur le client web, qui a exactement le même défaut : socket.io ne
   * retente PAS après un refus du middleware d'authentification. Une seule tentative, puis
   * plus rien — le temps réel meurt en silence dès que le jeton d'accès expire (15 min) et
   * que quelque chose force une reconnexion : réseau, veille, ou redémarrage du serveur.
   *
   * ⚠️ `resumeSocket` ne suffit pas : il ne joue qu'au retour au PREMIER PLAN. Une coupure
   * survenue pendant que l'app est affichée n'était rattrapée par personne.
   *
   * ⚠️ On ne renouvelle QUE si le jeton est expiré. Une erreur de connexion avec un jeton
   * valide veut dire que le serveur est injoignable, et il n'y a rien à renouveler — c'est
   * aussi ce qui empêche la boucle, le second passage trouvant un jeton frais.
   */
  socket.on("connect_error", async (err) => {
    const current = await getAccessToken();
    if (current && !isTokenExpired(current)) {
      console.warn("[Socket] Connexion refusée :", err.message);
      return;
    }
    const fresh = await refreshAccessToken();
    if (!fresh || !socket) return;
    console.log("[Socket] Jeton renouvelé, reconnexion");
    socket.auth = { token: fresh, platform: "mobile" };
    socket.connect();
  });
  socket.on("error", (err: { message: string }) =>
    console.warn("[Socket] Erreur:", err.message),
  );

  return socket;
};

export const getSocket = (): Socket | null => socket;

/**
 * Branche un écouteur en REMPLAÇANT celui posé sous le même nom.
 *
 * ⚠️ POURQUOI ce détour plutôt qu'un `socket.off(event, handler)` : le socket est un
 * singleton qui SURVIT au rechargement des modules. Quand Fast Refresh réévalue un module, la
 * fonction qu'il exporte change d'identité — `off` ne retrouve donc plus celle qui est
 * réellement branchée, `on` en ajoute une seconde, et l'événement est traité deux fois. Puis
 * trois. Symptôme constaté le 11/09 : le même message affichait trois bandeaux d'alerte.
 *
 * ⚠️ La table des écouteurs vit sur L'INSTANCE DU SOCKET, pas dans un module : c'est le seul
 * endroit dont la durée de vie couvre celle du problème. Une variable de module serait
 * remplacée en même temps que le reste.
 *
 * ⚠️ `name` identifie le POSTE D'ÉCOUTE, pas l'événement : deux écrans peuvent écouter
 * `conversation_updated` pour des raisons différentes (la liste le compte, la racine en fait
 * un bandeau) et ne doivent pas se chasser l'un l'autre.
 */
export const bindSocket = (
  socket: Socket,
  event: string,
  name: string,
  handler: (...args: never[]) => void,
): void => {
  const bound: Map<string, (...args: never[]) => void> =
    ((socket as any).__bound ??= new Map());
  const key = `${event}:${name}`;
  const previous = bound.get(key);
  if (previous) socket.off(event, previous as never);
  bound.set(key, handler);
  socket.on(event, handler as never);
};

/**
 * Ferme la connexion quand l'app passe en arrière-plan.
 *
 * Le serveur ne pousse une notification qu'aux utilisateurs qu'il croit hors ligne. Tant
 * que le socket reste ouvert, une app en arrière-plan continue de compter comme « en
 * ligne » : les messages partent en événement socket, que personne ne reçoit, et aucune
 * notification n'est envoyée. La coupure était détectée seule, mais avec plusieurs
 * secondes de retard — d'où des messages silencieux juste après avoir quitté l'app.
 *
 * ⚠️ Ne PAS passer par `disconnectSocket()` ici : il met l'instance à `null`, alors que
 * les écrans gardent la référence obtenue à leur montage. `socket.disconnect()` conserve
 * l'instance et ses écouteurs, que `resumeSocket` réutilise tels quels.
 */
export const pauseSocket = () => {
  socket?.disconnect();
};

/** Rouvre la connexion au retour au premier plan. */
export const resumeSocket = async () => {
  if (!socket || socket.connected) return;
  try {
    // Le jeton d'accès (15 min) a pu expirer pendant la veille : on relit celui en cours,
    // rafraîchi par `api.ts`, sinon le serveur rejette la connexion à l'authentification.
    // ⚠️ RÉÉCRIRE `auth` en entier : n'y remettre que le jeton effacerait `platform`, et
    // le serveur retomberait sur son défaut à chaque retour au premier plan.
    socket.auth = { token: await getAccessToken(), platform: "mobile" };
  } catch {
    // Lecture impossible : on tente avec le jeton précédent plutôt que de rester muet.
  }
  socket.connect();
};

/** Déconnexion définitive (changement de compte) : l'instance est jetée. */
export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
