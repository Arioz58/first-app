import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';

/**
 * Bandeaux d'alerte affichés À L'INTÉRIEUR de l'application.
 *
 * ⚠️ POURQUOI ils existent : le serveur n'envoie une notification système qu'à qui n'a pas
 * l'app mobile ouverte (`isUserOnMobile`, correctif du 10/09). Application ouverte, un
 * message qui arrive dans une AUTRE conversation ne produisait donc rien du tout — ni son,
 * ni bandeau : la personne ne l'apprenait qu'en revenant à la liste. C'est exactement ce que
 * le client a remonté.
 *
 * ⚠️ Store externe et non Context : le bandeau est rendu par `app/_layout.tsx`, qui serait
 * aussi le fournisseur — un composant ne peut pas consommer le Context qu'il fournit. Même
 * mécanique que `friendRequests.ts` et `unreadMessages.ts`.
 */
export type Toast = {
  id: string;
  /**
   * À quoi se rattache l'alerte : un identifiant de conversation, ou `friend:<id>`.
   *
   * ⚠️ Ce n'est PAS une clé de regroupement — chaque message a son propre bandeau (voir
   * `showToast`). Elle sert à retirer d'un coup toutes les alertes d'une conversation quand on
   * l'ouvre.
   */
  key: string;
  title: string;
  body: string;
  photoUrl: string | null;
  /** Avatar de repli : deux silhouettes pour un groupe, l'initiale sinon. */
  isGroup: boolean;
  /** Route ouverte au tap. Sans elle, le bandeau n'est qu'informatif. */
  href: string | null;
  /**
   * Rappel exécuté au tap, AVANT la navigation (ouvrir un segment, consommer un relais).
   * ⚠️ Gardé hors du rendu : il ne participe à aucune comparaison, sa présence ne doit pas
   * provoquer de nouveau rendu.
   */
  onOpen?: () => void;
};

/** Durée d'affichage. Assez pour lire deux lignes, assez court pour ne pas gêner. */
const LIFETIME = 5000;

/**
 * Nombre d'alertes CONSERVÉES. Trois sont visibles en pile fermée, toutes une fois dépliée
 * (voir `ToastStack`).
 *
 * ⚠️ Plafonné à cinq : dépliée, la liste occupe `5 × 72 px` et couvre déjà le tiers d'un
 * écran de téléphone. Au-delà, une alerte ne préviendrait plus de rien, elle cacherait l'app.
 */
const MAX = 5;

let toasts: Toast[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// ⚠️ Le hook doit RENVOYER ce qu'il observe, et le snapshot être stable tant que rien ne
// change : `useSyncExternalStore` compare par identité et boucherait sur un tableau recréé à
// chaque appel. Voir la note sur `useMyLiveShare` dans CLAUDE.md.
const getSnapshot = () => toasts;

const emit = () => listeners.forEach((l) => l());

/**
 * Expiration SUSPENDUE — la pile est dépliée, donc quelqu'un est en train de la lire.
 *
 * ⚠️ Sans cela, les entrées s'effaceraient une à une sous les yeux pendant qu'on parcourt la
 * liste, et la ligne visée se déroberait au moment du doigt.
 */
let paused = false;

const arm = (id: string) => {
  clearTimeout(timers.get(id));
  if (paused) return;
  timers.set(
    id,
    setTimeout(() => dismissToast(id), LIFETIME),
  );
};

/** La pile s'ouvre : plus rien n'expire tant qu'elle est dépliée. */
export const pauseToastExpiry = (): void => {
  paused = true;
  timers.forEach(clearTimeout);
  timers.clear();
};

/**
 * La pile se referme : chaque alerte repart pour une durée pleine.
 *
 * ⚠️ Le temps déjà écoulé avant l'ouverture est perdu, volontairement : on vient de les
 * relire, les faire disparaître aussitôt après serait le contraire du service rendu.
 */
export const resumeToastExpiry = (): void => {
  paused = false;
  toasts.forEach((t) => arm(t.id));
};

/**
 * Compteur d'identifiants.
 *
 * ⚠️ Un horodatage ne suffit pas : deux messages d'un même envoi arrivent dans la même
 * milliseconde, et deux bandeaux de même identifiant se remplaceraient en silence.
 */
let seq = 0;

/**
 * Empile une alerte.
 *
 * ⚠️ UN BANDEAU PAR MESSAGE, et non un par conversation (première version, corrigée le 11/09
 * après essai). Regrouper par conversation paraissait raisonnable — c'est ce que fait le `tag`
 * des notifications du navigateur — mais la pile n'apparaissait alors JAMAIS en usage normal :
 * il fallait recevoir des messages de plusieurs conversations DIFFÉRENTES dans la même fenêtre
 * de cinq secondes. L'empilement est précisément ce qu'on veut montrer.
 *
 * ⚠️ Ce qui rendait le regroupement acceptable est ce qui le rend inutile : `MAX` borne déjà
 * la pile, et les plus anciennes sortent d'elles-mêmes.
 */
export const showToast = (toast: Omit<Toast, 'id'>): void => {
  const next: Toast = { ...toast, id: `${toast.key}-${seq++}` };

  // Le plus récent en tête : c'est lui qui occupe le devant de la pile.
  toasts = [next, ...toasts].slice(0, MAX);
  // Les bandeaux évincés par `slice` emportent leur minuteur, qui parlerait dans le vide.
  for (const [id, timer] of timers) {
    if (!toasts.some((t) => t.id === id)) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }
  arm(next.id);
  // Un bandeau arrive sans qu'on l'ait demandé : le retour tactile le fait remarquer même
  // quand on regarde ailleurs sur l'écran. Volontairement léger — ce n'est pas une action
  // de l'utilisateur, seulement une information.
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  emit();
};

export const dismissToast = (id: string): void => {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

/**
 * Retire TOUTES les alertes d'une conversation.
 *
 * ⚠️ Appelé à l'OUVERTURE d'une conversation : ses bandeaux n'ont plus lieu d'être une fois
 * qu'on est dedans, et les laisser vivre inviterait à naviguer là où on est déjà. Toutes et
 * pas une seule — un message par bandeau, il y en a donc autant que de messages reçus.
 */
export const dismissToastsFor = (key: string): void => {
  const doomed = toasts.filter((t) => t.key === key);
  if (!doomed.length) return;
  doomed.forEach((t) => {
    clearTimeout(timers.get(t.id));
    timers.delete(t.id);
  });
  toasts = toasts.filter((t) => t.key !== key);
  emit();
};

/** Vide tout — déconnexion, changement de compte. */
export const clearToasts = (): void => {
  timers.forEach(clearTimeout);
  timers.clear();
  paused = false;
  if (!toasts.length) return;
  toasts = [];
  emit();
};

export const useToasts = (): Toast[] =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
