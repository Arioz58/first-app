import { useSyncExternalStore } from "react";

/**
 * État de la connexion temps réel, tel que `lib/socket.ts` le constate.
 *
 * Store externe plutôt qu'un état d'écran : la réponse à « sommes-nous coupés ? » ne peut
 * venir que du socket. La liste des conversations la déduisait jusqu'ici elle-même, à partir
 * des événements bruts (`disconnect`, `connect_error`) — et le client web, qui porte le même
 * bandeau, refaisait le même raisonnement de son côté, avec la même erreur.
 *
 * ⚠️ POURQUOI UN SEUL ENDROIT DÉCIDE : un `connect_error` n'est PAS toujours une coupure. Au
 * retour d'arrière-plan, le jeton d'accès (15 min) a le plus souvent expiré, le serveur refuse
 * donc le handshake, et le socket renouvelle puis se reconnecte de lui-même. C'est un passage
 * obligé, pas un incident — mais vu depuis un écran, il est indiscernable d'une vraie panne.
 * Seul `socket.ts` sait s'il a tenté un renouvellement et si celui-ci a abouti.
 *
 * ⚠️ Symptôme qui l'a révélé (client, 15/09) : un bandeau rouge « Mise à jour impossible » à
 * chaque retour sur l'application, mobile ET web, qui disparaissait seul au bout d'une dizaine
 * de secondes — exactement la durée du renouvellement. Le cas avait été prévu au LANCEMENT
 * (« un simple jeton expiré n'est pas une panne ») et oublié au RETOUR D'ARRIÈRE-PLAN, alors
 * que c'est le même événement.
 */
let offline = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => offline;

/**
 * Réservé à `lib/socket.ts` : lui seul dispose des éléments pour trancher.
 *
 * ⚠️ Ne pas l'appeler depuis un écran sur un événement socket brut — ce serait refaire
 * précisément le raisonnement que ce module existe pour tenir en un seul endroit. Un échec de
 * requête HTTP, lui, reste l'affaire de l'écran qui l'a lancée : il sait ce qu'il demandait.
 */
export const setConnectionOffline = (next: boolean) => {
  if (next === offline) return;
  offline = next;
  listeners.forEach((l) => l());
};

/**
 * ⚠️ Le hook RENVOIE la valeur qu'il observe au lieu de la relire par un appel externe : le
 * compilateur React a le droit de mémoïser un tel appel sur des arguments qui ne changent
 * jamais, et l'affichage resterait alors figé jusqu'au remontage de l'écran (constaté le
 * 06/08 sur `useMyLiveShare`). Même forme que `friendRequests` et `unreadMessages`.
 */
export const useConnectionOffline = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
