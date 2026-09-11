import { BASE_URL } from "./config";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getUserId,
  saveTokens,
} from "./storage";

let sessionExpiredHandler: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

/**
 * Renouvelle le jeton d'accès à partir de celui de rafraîchissement.
 *
 * ⚠️ LA PROMESSE EN VOL EST PARTAGÉE. Plusieurs requêtes partent en parallèle au lancement
 * d'un écran ; si le jeton vient d'expirer, elles reçoivent toutes un 401 en même temps et
 * déclencheraient chacune leur propre renouvellement. Le serveur invalidant l'ancien jeton de
 * rafraîchissement à chaque usage, la première réussirait et les suivantes DÉCONNECTERAIENT
 * l'utilisateur. Le client web se protégeait déjà ainsi, pas le mobile.
 *
 * ⚠️ Exporté pour le socket, qui porte son jeton dans son handshake et doit pouvoir le
 * renouveler lui-même — voir `lib/socket.ts`.
 *
 * ⚠️ Renvoie `null` sans effacer la session : un réseau coupé n'est pas une session expirée,
 * et c'est à l'appelant de décider quoi en faire.
 */
let refreshing: Promise<string | null> | null = null;

export const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      await saveTokens(data.accessToken, data.refreshToken, (await getUserId()) ?? "");
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
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
    const fresh = await refreshAccessToken();
    if (fresh) {
      headers["Authorization"] = `Bearer ${fresh}`;
      const retry = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return retry.json();
    }
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
