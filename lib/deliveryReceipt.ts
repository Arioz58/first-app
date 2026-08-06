import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

/**
 * Accusé de RÉCEPTION depuis l'arrière-plan, côté Android.
 *
 * ⚠️ L'app ferme son socket dès qu'elle passe en arrière-plan — c'est ce qui permet aux
 * notifications d'exister (le serveur ne pousse qu'aux utilisateurs qu'il croit hors
 * ligne). Plus rien ne peut donc dire au serveur qu'un message est arrivé : le seul code
 * qui s'exécute encore est celui qui traite la notification. Sur iOS c'est l'extension
 * (`targets/notification`), sur Android cette tâche.
 *
 * ⚠️ L'autorisation ne vient PAS du JWT — la tâche peut s'exécuter dans un contexte neuf,
 * sans session chargée. Le serveur glisse dans la notification un jeton signé qui
 * n'autorise que cet accusé (`src/lib/receipts.ts` côté backend), et on le lui renvoie tel
 * quel.
 *
 * ⚠️ Enregistrement natif : après ajout, un `expo run:android` est nécessaire, un reload
 * Metro ne suffit pas.
 */
const TASK = 'nexa-delivery-receipt';

/**
 * La charge utile d'une notification Expo n'est pas au même endroit selon la plateforme et
 * le chemin d'arrivée : on regarde donc aux emplacements connus plutôt que d'en supposer
 * un. Un `data` introuvable n'est pas une erreur — la notification s'affiche quand même.
 */
const extract = (raw: unknown): Record<string, unknown> => {
  const d = raw as any;
  return (
    d?.notification?.data?.body ??
    d?.notification?.data ??
    d?.data?.body ??
    d?.data ??
    d?.body ??
    {}
  );
};

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) return;
  const payload = extract(data);
  const url = payload.receiptUrl;
  const token = payload.receiptToken;
  const conversationId = payload.conversationId;
  if (typeof url !== 'string' || typeof token !== 'string' || typeof conversationId !== 'string') {
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, token }),
    });
  } catch {
    // Silencieux et sans reprise : l'accusé est un raffinement. S'il n'part pas, la
    // réception sera constatée au retour de l'app au premier plan, comme avant.
  }
});

/**
 * Enregistrée sur LES DEUX plateformes.
 *
 * Sur iOS elle ne double pas l'extension, elle couvre ce que l'extension ne peut pas
 * atteindre : les pushes SILENCIEUX, envoyés aux conversations en sourdine ou en attente
 * d'acceptation. L'extension ne s'exécute que pour les notifications destinées à être
 * affichées — donc jamais pour celles-là.
 *
 * ⚠️ Demande `UIBackgroundModes: remote-notification` dans `app.json`, sans quoi iOS ne
 * réveille pas l'app pour un push silencieux.
 */
export const registerDeliveryReceiptTask = async () => {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.registerTaskAsync(TASK);
  } catch {
    // Enregistrement refusé (permission, appareil non compatible) : on s'en passe. La
    // réception sera constatée au retour au premier plan, comme avant.
  }
};
