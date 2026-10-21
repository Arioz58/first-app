import { createAudioPlayer, type AudioPlayer, type AudioSource } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { apiRequest } from './api';
import { isCallActive } from './callEngine';
import i18n from './i18n';

/**
 * Son des notifications, au choix de l'utilisateur (demande de Hakan du 03/10, livrée le 21/10).
 * UN son pour toutes les notifications de l'app (messages et groupes) — décision de Berke.
 *
 * ⚠️ CE NE SONT PAS LES SONS DU TÉLÉPHONE. iOS n'offre aucun moyen de lister ni d'utiliser
 * ses sons système (Note, Aurora…) : le son d'une notification doit être un fichier EMBARQUÉ
 * dans l'app, désigné par le serveur dans le push. Chaque son ci-dessous est donc déclaré au
 * plugin `expo-notifications` (`app.json`, clé `sounds`) → rebuild natif à chaque ajout.
 *
 * ⚠️ LA LISTE EST UN CONTRAT avec le serveur (`src/lib/notificationSounds.ts`), qui refuse
 * un identifiant inconnu et en déduit le fichier (iOS) et le canal (Android).
 *
 * ⚠️ Le CHOIX vit sur le compte (serveur), car c'est le serveur qui fait sonner. On en garde
 * une copie locale pour ce qui se décide sur l'appareil sans attendre le réseau : l'affichage
 * du réglage et le canal Android. ⚠️ App OUVERTE, un message reçu joue le pop grave de
 * `lib/sounds.ts`, pas ce son-ci (demande de Berke, 21/10).
 *
 * ⚠️ Les fichiers sont tous ramenés au niveau du son d'origine (−28,5 LUFS, gain CUIT dans
 * le fichier) : le système les joue tels quels, sans prise sur leur volume. Provenance et
 * traitement : `assets/sounds/SOURCES.md`.
 *
 * Noms : des noms propres, identiques dans les trois langues, dans l'esprit de ceux d'iOS.
 *
 * ⚠️ `system` (demande de Berke, 21/10) : le son de notification RÉGLÉ SUR LE TÉLÉPHONE.
 * Ce n'est pas un fichier : le serveur envoie `sound: 'default'` (iOS) et un canal au son
 * par défaut (Android). Pas de nom propre (`name: null`, libellé traduit `notif_sound.system`)
 * et pas d'aperçu : l'app n'a aucun moyen de lire ce son-là.
 */
export const NOTIFICATION_SOUNDS = [
  { id: 'nexa', name: 'Nexa', source: require('../assets/sounds/notification.wav') },
  { id: 'system', name: null, source: null },
  { id: 'cascade', name: 'Cascade', source: require('../assets/sounds/notif_cascade.wav') },
  { id: 'iris', name: 'Iris', source: require('../assets/sounds/notif_iris.wav') },
  { id: 'echo', name: 'Echo', source: require('../assets/sounds/notif_echo.wav') },
  { id: 'opal', name: 'Opal', source: require('../assets/sounds/notif_opal.wav') },
  { id: 'prisma', name: 'Prisma', source: require('../assets/sounds/notif_prisma.wav') },
  { id: 'lumen', name: 'Lumen', source: require('../assets/sounds/notif_lumen.wav') },
  { id: 'orbit', name: 'Orbit', source: require('../assets/sounds/notif_orbit.wav') },
  { id: 'pulse', name: 'Pulse', source: require('../assets/sounds/notif_pulse.wav') },
  { id: 'halo', name: 'Halo', source: require('../assets/sounds/notif_halo.wav') },
  { id: 'nova', name: 'Nova', source: require('../assets/sounds/notif_nova.wav') },
  { id: 'comet', name: 'Comet', source: require('../assets/sounds/notif_comet.wav') },
] as const satisfies readonly { id: string; name: string | null; source: AudioSource | null }[];

export type NotificationSoundId = (typeof NOTIFICATION_SOUNDS)[number]['id'];

export const DEFAULT_NOTIFICATION_SOUND: NotificationSoundId = 'nexa';

const KEY = 'notification_sound';

const isSoundId = (v: unknown): v is NotificationSoundId =>
  NOTIFICATION_SOUNDS.some((s) => s.id === v);

const notificationSoundSource = (id: NotificationSoundId): AudioSource | null =>
  (NOTIFICATION_SOUNDS.find((s) => s.id === id) ?? NOTIFICATION_SOUNDS[0]).source;

/** Le nom affiché — traduit pour le son du téléphone, qui n'a pas de nom propre. */
export const notificationSoundName = (id: NotificationSoundId): string =>
  (NOTIFICATION_SOUNDS.find((s) => s.id === id) ?? NOTIFICATION_SOUNDS[0]).name ??
  i18n.t('notif_sound.system');

/** Valeur en mémoire : un son reçu ne peut pas attendre la lecture du trousseau. */
let current: NotificationSoundId = DEFAULT_NOTIFICATION_SOUND;
/** Le compte a parlé : la copie locale, lue plus lentement, ne doit plus l'écraser. */
let synced = false;
const listeners = new Set<() => void>();

const apply = (id: NotificationSoundId) => {
  if (id === current) return;
  current = id;
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(KEY, id).catch(() => {});
};

export const getNotificationSound = () => current;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => current;

/** ⚠️ RENVOIE la valeur observée (règle du compilateur React, voir `lib/sounds.ts`). */
export const useNotificationSound = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/**
 * Le canal Android du son choisi.
 *
 * ⚠️ Depuis Android 8, le son appartient au CANAL et ne change plus une fois le canal créé :
 * un canal par son (`messages_<son>`), le serveur désignant celui qui correspond au choix.
 * `messages` (le défaut) est créé par `registerForPushNotifications` et n'est jamais retiré —
 * les notifications envoyées avant un changement de son y arrivent encore.
 *
 * ⚠️ Les canaux des sons abandonnés sont SUPPRIMÉS : chacun ajouterait une entrée « Messages »
 * de plus dans les réglages système de l'app.
 */
const ensureAndroidChannel = async (id: NotificationSoundId) => {
  if (Platform.OS !== 'android') return;
  try {
    const keep = id === 'nexa' ? 'messages' : `messages_${id}`;
    if (id !== 'nexa') {
      await Notifications.setNotificationChannelAsync(keep, {
        name: `Messages (${notificationSoundName(id)})`,
        importance: Notifications.AndroidImportance.MAX,
        // Sans extension : Android désigne une ressource, nommée d'après le fichier.
        // `default` : le son de notification réglé sur le téléphone.
        sound: id === 'system' ? 'default' : `notif_${id}`,
      });
    }
    const channels = await Notifications.getNotificationChannelsAsync();
    await Promise.all(
      channels
        .filter((c) => c.id.startsWith('messages_') && c.id !== keep)
        .map((c) => Notifications.deleteNotificationChannelAsync(c.id)),
    );
  } catch {
    // Sans canal, Android retombe sur le canal de repli d'expo-notifications : la
    // notification arrive, avec un autre son.
  }
};

/** Restaure la copie locale au démarrage (même principe qu'`initSounds`). */
export const initNotificationSound = async () => {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (isSoundId(v) && !synced) {
      current = v;
      listeners.forEach((l) => l());
    }
  } catch {
    // Trousseau illisible : on reste sur le défaut.
  }
};

/**
 * Aligne la copie locale sur le compte (appelé à l'ouverture de session).
 *
 * ⚠️ Le compte fait foi : sur un nouveau téléphone, ou après qu'un autre compte s'est servi de
 * celui-ci, la copie locale est fausse — et le canal Android avec elle.
 */
export const refreshNotificationSound = async () => {
  try {
    const me = await apiRequest<{ notificationSound?: string }>('/users/me');
    const id = isSoundId(me.notificationSound) ? me.notificationSound : DEFAULT_NOTIFICATION_SOUND;
    synced = true;
    apply(id);
    await ensureAndroidChannel(id);
  } catch {
    // Hors ligne : on garde la copie locale.
  }
};

/**
 * Choisir un son. ⚠️ Le canal Android est créé AVANT d'écrire le choix au serveur : sinon une
 * notification partie entre-temps désignerait un canal qui n'existe pas encore.
 */
export const setNotificationSound = async (id: NotificationSoundId): Promise<boolean> => {
  const previous = current;
  synced = true;
  apply(id);
  await ensureAndroidChannel(id);
  try {
    await apiRequest('/users/me/notification-sound', { method: 'PATCH', body: { sound: id } });
    return true;
  } catch {
    // Le serveur n'a pas enregistré le choix : il continuerait de sonner avec l'ancien, on
    // revient donc à l'ancien ici aussi plutôt que d'afficher un choix qui n'a pas d'effet.
    apply(previous);
    await ensureAndroidChannel(previous);
    return false;
  }
};

/**
 * Écoute d'un son dans la liste. ⚠️ Jouée même si les sons des messages sont coupés : c'est
 * une action explicite, on vient de toucher le son pour l'entendre. Jamais pendant un appel :
 * la fin de lecture d'un lecteur `expo-audio` coupe la session audio dont Agora se sert.
 */
let apercu: AudioPlayer | null = null;
export const previewNotificationSound = (id: NotificationSoundId) => {
  if (isCallActive()) return;
  try {
    const source = notificationSoundSource(id);
    // Son du téléphone : rien à lire, l'app n'y a pas accès.
    if (!source) {
      apercu?.pause();
      return;
    }
    if (!apercu) apercu = createAudioPlayer(source);
    else apercu.replace(source);
    apercu.volume = 1;
    apercu.seekTo(0);
    apercu.play();
  } catch {
    // Session audio occupée : pas d'aperçu, le choix reste possible.
  }
};
