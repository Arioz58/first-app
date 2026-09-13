import { BASE_URL } from "./config";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getUserId,
  saveTokens,
} from "./storage";

/**
 * Le serveur n'a pas pu être joint pour renouveler la session. ⚠️ À traiter comme une panne
 * réseau ordinaire — surtout PAS comme une déconnexion : la session est peut-être intacte.
 */
export const NETWORK_UNAVAILABLE = "NETWORK_UNAVAILABLE";

let sessionExpiredHandler: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

/**
 * Renouvelle le jeton d'accès à partir de celui de rafraîchissement.
 *
 * ⚠️ LA PROMESSE EN VOL EST PARTAGÉE. Plusieurs requêtes partent en parallèle au lancement
 * d'un écran ; si le jeton vient d'expirer, elles reçoivent toutes un 401 en même temps et
 * déclencheraient chacune leur propre renouvellement — autant d'allers-retours inutiles, au
 * pire moment, celui où l'écran attend déjà.
 *
 * ⚠️ CE N'EST PAS une protection contre la déconnexion, contrairement à ce que laissaient
 * entendre les commentaires des deux clients : `POST /auth/refresh` se contente de VÉRIFIER la
 * signature du jeton de rafraîchissement et de renvoyer un nouvel accès. Il ne le fait pas
 * tourner et n'invalide pas l'ancien — deux renouvellements simultanés réussissent donc tous
 * les deux (vérifié dans `auth.service.ts` le 11/09). Ne pas se fier à une rotation qui
 * n'existe pas : elle reste à faire, et elle est notée au `todo` pour le Mois 5.
 *
 * ⚠️ Exporté pour le socket, qui porte son jeton dans son handshake et doit pouvoir le
 * renouveler lui-même — voir `lib/socket.ts`.
 *
 * ⚠️ Renvoie `null` sans effacer la session : un réseau coupé n'est pas une session expirée,
 * et c'est à l'appelant de décider quoi en faire.
 */
/**
 * Pourquoi un renouvellement a échoué — la distinction qui évite de déconnecter à tort.
 *
 * ⚠️ `refused` et `unreachable` ne veulent PAS dire la même chose et n'appellent pas la même
 * réaction. Jusqu'au 13/09 les deux renvoyaient `null`, et l'appelant effaçait la session dans
 * les deux cas : une requête de renouvellement qui n'aboutissait pas — réseau coupé, serveur
 * en train de redémarrer — déconnectait pour de bon un utilisateur dont la session était
 * parfaitement valide, l'obligeant à refaire un code SMS.
 */
type RefreshResult =
  | { status: "ok"; token: string }
  | { status: "refused" }
  | { status: "unreachable" };

let refreshing: Promise<RefreshResult> | null = null;

const refreshSession = async (): Promise<RefreshResult> => {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const refreshToken = await getRefreshToken();
    // Pas de jeton du tout : il n'y a rien à renouveler, et rien à attendre d'un réessai.
    if (!refreshToken) return { status: "refused" as const };
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        /**
         * ⚠️ Un 5xx n'est PAS un refus du jeton : c'est le serveur qui est en peine
         * (redémarrage, déploiement, passerelle). Le traiter comme une session morte
         * déconnecterait tout le monde à chaque mise en production.
         */
        return { status: res.status >= 500 ? "unreachable" : "refused" } as const;
      }
      const data = await res.json();
      await saveTokens(data.accessToken, data.refreshToken, (await getUserId()) ?? "");
      return { status: "ok" as const, token: data.accessToken as string };
    } catch {
      // La requête n'a pas abouti : on ne sait RIEN de la validité de la session.
      return { status: "unreachable" as const };
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
};

/**
 * Façade pour le socket, qui n'a besoin que du jeton.
 *
 * ⚠️ Il n'a pas à distinguer les deux échecs : en cas d'échec il ne touche à rien et laisse
 * sa propre mécanique de reconnexion réessayer plus tard.
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  const result = await refreshSession();
  return result.status === "ok" ? result.token : null;
};

type RequestOptions = {
  method?: string;
  body?: object;
  auth?: boolean;
};

export const apiRequest = async <T>(
  path: string,
  { method = "GET", body, auth = true }: RequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = await getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth) {
    // Tenter un refresh uniquement pour les requêtes authentifiées.
    const refreshed = await refreshSession();
    if (refreshed.status === "ok") {
      headers["Authorization"] = `Bearer ${refreshed.token}`;
      const retry = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return retry.json();
    }
    /**
     * ⚠️ RENOUVELLEMENT NON ABOUTI : on n'efface RIEN.
     *
     * On ne sait pas si la session est morte — la requête n'est simplement jamais arrivée.
     * Effacer les jetons ici déconnectait pour de bon un utilisateur parfaitement valide,
     * qui devait refaire un code SMS : il suffisait que le serveur redémarre pendant le
     * renouvellement. L'appel échoue donc comme n'importe quelle panne réseau, et la
     * prochaine requête retentera avec la session intacte.
     */
    if (refreshed.status === "unreachable") {
      throw new Error(NETWORK_UNAVAILABLE);
    }
    // Refus explicite du serveur : la session est bel et bien morte.
    await clearTokens();
    sessionExpiredHandler?.();
    throw new Error("SESSION_EXPIRED");
  }

  const data = await res.json();
  if (!res.ok) {
    // Le code HTTP est attaché à l'erreur : certains appelants doivent distinguer un refus
    // métier d'une panne réseau (410 = partage de position terminé, par exemple), ce que
    // le seul message ne permet pas de faire sans se fier à son texte.
    const error = new Error(data.message || "Erreur serveur") as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return data;
};
