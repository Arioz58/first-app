import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';
import { apiRequest } from './api';
import { getSocket } from './socket';
import { getLiveShares, setLiveShares } from './storage';

/** Durées proposées, en secondes. Le serveur les borne de son côté. */
export const LIVE_DURATIONS = [15 * 60, 60 * 60, 8 * 60 * 60] as const;

export const LIVE_TASK = 'nexa-live-location';

/**
 * Partages de MA position en cours : `conversationId` → échéance (ms epoch).
 *
 * Copie mémoire de ce que garde `storage` : l'app la lit à chaque rendu, la tâche de fond
 * relit le disque. Un seul suivi alimente toutes les conversations concernées — inutile de
 * multiplier les capteurs.
 */
let shares: Record<string, number> = {};
let hydrated = false;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const persist = () => setLiveShares(shares).catch(() => {});

/**
 * Balayage périodique des partages échus.
 *
 * ⚠️ Indispensable, et pas seulement au moment d'un relevé : sans mouvement, aucun relevé
 * n'arrive (seuil de 25 m), donc rien ne viendrait constater l'échéance — le bandeau
 * resterait affiché jusqu'à ce qu'on rouvre la conversation. Ce battement sert aussi à
 * rafraîchir le temps restant, qui serait sinon figé à sa valeur de départ.
 */
let sweeper: ReturnType<typeof setInterval> | null = null;

const sweep = () => {
  const now = Date.now();
  const expired = Object.entries(shares).filter(([, exp]) => exp <= now);
  if (expired.length) {
    for (const [conversationId] of expired) {
      delete shares[conversationId];
      getSocket()?.emit('live_location_stop', { conversationId });
    }
    persist();
    if (!Object.keys(shares).length) stopTracking().catch(() => {});
  }
  // Notifié dans tous les cas : le compte à rebours doit avancer même sans expiration.
  notify();
};

const ensureSweeper = () => {
  if (!sweeper) sweeper = setInterval(sweep, 30_000);
};

const stopSweeper = () => {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
};

/** Recharge l'état depuis le disque (démarrage de l'app, après un redémarrage système). */
export const hydrateLiveShares = async () => {
  if (hydrated) return;
  hydrated = true;
  const stored = await getLiveShares();
  const now = Date.now();
  shares = Object.fromEntries(Object.entries(stored).filter(([, exp]) => exp > now));
  if (Object.keys(shares).length !== Object.keys(stored).length) persist();
  if (Object.keys(shares).length) {
    await ensureTracking().catch((e) => console.warn('[live] suivi indisponible :', e));
    notify();
  }
};

/**
 * Envoi d'un relevé à toutes les conversations concernées.
 *
 * ⚠️ En **HTTP** et non par socket : l'app ferme sa connexion en arrière-plan pour que le
 * serveur la sache hors ligne et lui envoie les notifications — or c'est précisément là que
 * la tâche s'exécute. Le serveur rediffuse ensuite aux autres membres.
 *
 * Un 410 signifie que le partage est terminé côté serveur : on cesse d'émettre plutôt que
 * de réveiller le téléphone pour rien.
 */
const publish = async (latitude: number, longitude: number) => {
  const current = await getLiveShares();
  const now = Date.now();
  let changed = false;

  for (const [conversationId, expiresAt] of Object.entries(current)) {
    if (expiresAt <= now) {
      delete current[conversationId];
      changed = true;
      continue;
    }
    try {
      await apiRequest(`/conversations/${conversationId}/live-location`, {
        method: 'POST',
        body: { latitude, longitude },
      });
    } catch (e: any) {
      // 410 : le serveur a clos le partage (expiré, ou arrêté depuis un autre appareil).
      // Toute autre erreur est tenue pour passagère — on garde le partage, le relevé
      // suivant réessaiera.
      if (e?.status === 410) {
        delete current[conversationId];
        changed = true;
      }
    }
  }

  if (changed) {
    shares = current;
    await setLiveShares(current);
    notify();
    if (!Object.keys(current).length) await stopTracking();
  }
};

// La tâche doit être définie au chargement du module, avant que le système ne la déclenche.
TaskManager.defineTask(LIVE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const last = locations?.[locations.length - 1];
  if (!last) return;
  await publish(last.coords.latitude, last.coords.longitude);
});

const isTracking = () => Location.hasStartedLocationUpdatesAsync(LIVE_TASK);

// Suivi de secours, actif tant que l'app est à l'écran.
let foregroundWatcher: Location.LocationSubscription | null = null;

const stopForegroundWatcher = () => {
  foregroundWatcher?.remove();
  foregroundWatcher = null;
};

const startForegroundWatcher = async () => {
  if (foregroundWatcher) return;
  foregroundWatcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 25 },
    (position) => publish(position.coords.latitude, position.coords.longitude),
  );
};

/**
 * Met en route le suivi : tâche de fond si possible, sinon suivi de premier plan.
 *
 * ⚠️ Les deux, et pas seulement le premier : `startLocationUpdatesAsync` ÉCHOUE quand la
 * permission « Toujours » est refusée — et sur simulateur, les tâches de fond sont peu
 * fiables. S'en remettre à elle seule laissait le partage muet après sa position initiale,
 * sans le moindre signe. Le repli garantit qu'un partage émet toujours quelque chose tant
 * que l'app est ouverte.
 */
const ensureTracking = async () => {
  ensureSweeper();
  if (await isTracking()) return;

  try {
    await startBackgroundTracking();
    stopForegroundWatcher(); // la tâche prend le relais, un seul capteur suffit
  } catch {
    await startForegroundWatcher();
  }
};

const startBackgroundTracking = async () => {
  await Location.startLocationUpdatesAsync(LIVE_TASK, {
    // Compromis batterie : une position toutes les ~15 s, et seulement au-delà de 25 m —
    // suivre quelqu'un d'immobile au mètre près ne dit rien de plus. iOS reste libre de
    // regrouper et différer les relevés, la fréquence demandée est un plafond.
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    // Android : la notification permanente n'est pas une option, c'est la contrepartie
    // imposée par le système pour suivre la position en arrière-plan. Autant qu'elle dise
    // clairement ce qui se passe.
    foregroundService: {
      notificationTitle: 'Nexa',
      notificationBody: 'Partage de votre position en cours',
      notificationColor: '#1E40AF',
    },
  });
};

const stopTracking = async () => {
  stopSweeper();
  stopForegroundWatcher();
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIVE_TASK);
};

export type StartOutcome =
  | { ok: true; background: boolean }
  | { ok: false; reason: 'denied'; canAskAgain: boolean };

/**
 * Démarre le partage dans une conversation (ou en repousse l'échéance).
 *
 * La permission d'arrière-plan est demandée **après** celle de premier plan, jamais avant :
 * iOS refuse la seconde tant que la première n'est pas accordée. Un refus ne bloque rien —
 * le partage fonctionne alors tant que l'app est ouverte, et l'écran signale les positions
 * figées.
 */
export const startLiveShare = async (
  conversationId: string,
  durationSec: number,
): Promise<StartOutcome> => {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { ok: false, reason: 'denied', canAskAgain: foreground.canAskAgain };
  }
  const background = await Location.requestBackgroundPermissionsAsync().catch(() => null);

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  shares = { ...shares, [conversationId]: Date.now() + durationSec * 1000 };
  // ⚠️ Attendu : `publish` relit la liste depuis le disque (la tâche de fond n'a que ça).
  // Sans cette attente, un premier relevé rapide n'y trouvait aucune conversation à servir.
  await setLiveShares(shares);

  // Le démarrage passe par le socket : l'app est au premier plan à cet instant, et cela
  // évite un aller-retour HTTP supplémentaire.
  getSocket()?.emit('live_location_start', {
    conversationId,
    durationSec,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  // `ensureTracking` retombe déjà sur le premier plan si la tâche de fond est refusée ;
  // un échec ici est donc réellement anormal et mérite de se voir dans les logs.
  await ensureTracking().catch((e) => console.warn('[live] suivi indisponible :', e));
  notify();
  return { ok: true, background: background?.status === 'granted' };
};

export const stopLiveShare = async (conversationId: string) => {
  if (!(conversationId in shares)) return;
  const next = { ...shares };
  delete next[conversationId];
  shares = next;
  persist();

  getSocket()?.emit('live_location_stop', { conversationId });
  if (!Object.keys(shares).length) await stopTracking();
  notify();
};

/** Tout arrêter (déconnexion) : aucun partage ne doit survivre au changement de compte. */
export const stopAllLiveShares = async () => {
  for (const conversationId of Object.keys(shares)) {
    getSocket()?.emit('live_location_stop', { conversationId });
  }
  shares = {};
  persist();
  await stopTracking();
  notify();
};

/** Échéance de MON partage dans cette conversation, ou null si je ne partage pas. */
export const myShareExpiry = (conversationId: string) => shares[conversationId] ?? null;

/**
 * Échéance de mon partage, réactive.
 *
 * ⚠️ La valeur DOIT être celle que renvoie `useSyncExternalStore`, et non un appel externe
 * fait juste après : le compilateur React (activé sur ce projet) est en droit de mémoïser
 * un tel appel sur ses arguments — `conversationId`, qui ne change jamais — et l'affichage
 * restait alors figé jusqu'au remontage de l'écran. Même forme que `friendRequests` et
 * `unreadMessages`.
 */
export const useMyLiveShare = (conversationId: string) => {
  const snapshot = () => shares[conversationId] ?? null;
  return useSyncExternalStore(subscribe, snapshot, snapshot);
};

/** « 12 min » — temps restant, pour l'afficher sans recalcul côté écran. */
export const remainingLabel = (expiresAt: number) => {
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
};
