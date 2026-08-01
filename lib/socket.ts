import { io, Socket } from "socket.io-client";
import { BASE_URL } from "./config";
import { getAccessToken } from "./storage";

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
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
  });

  socket.on("connect", () => console.log("[Socket] Connecté"));
  socket.on("disconnect", () => console.log("[Socket] Déconnecté"));
  socket.on("error", (err: { message: string }) =>
    console.warn("[Socket] Erreur:", err.message),
  );

  return socket;
};

export const getSocket = (): Socket | null => socket;

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
    socket.auth = { token: await getAccessToken() };
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
