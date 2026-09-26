import type { TFunction } from 'i18next';

/**
 * Historique des appels : ce que partagent l'onglet Appels et la fiche d'appel.
 *
 * ⚠️ Un seul endroit pour dire comment un appel se nomme (« sortant », « manqué »…) : les
 * deux écrans affichent les mêmes lignes, et deux copies de cette règle finiraient par
 * diverger — un appel « sans réponse » dans la liste et « manqué » dans la fiche.
 */

export type CallItem = {
  id: string;
  type: string;
  status: string;
  duration: number | null;
  createdAt: string;
  /** Le sens et le « manqué » sont calculés PAR LE SERVEUR, qui seul connaît les deux bouts. */
  outgoing: boolean;
  missed: boolean;
  peer: { id: string; name: string; photoUrl: string | null };
};

export const MISSED_COLOR = '#DC2626';

/** « 2:05 » — un appel se lit en minutes, jamais en secondes brutes. */
export const formatDuration = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

/**
 * L'appel BRUT tel que le serveur le joint à une bulle d'appel (`message.call`) — il n'a
 * pas été « mis en perspective » pour le lecteur, puisque `new_message` part avec une
 * seule charge pour les deux personnes.
 */
export type CallInfo = {
  id: string;
  type: string;
  status: string;
  callerId: string;
  receiverId: string;
  answeredAt: string | null;
  endedAt: string | null;
  duration: number | null;
  createdAt: string;
};

/** Ce qui suffit pour nommer un appel, qu'il vienne de l'historique ou d'une bulle. */
type CallFacts = Pick<CallItem, 'outgoing' | 'missed' | 'duration' | 'status'>;

/**
 * Manqué, POUR CETTE PERSONNE : elle était appelée, et l'appel a sonné sans qu'elle
 * décroche (`missed`) ou l'appelant a renoncé avant (`cancelled`).
 *
 * ⚠️ Même règle que le serveur (`isMissedFor`, `calls.service`) — qui la calcule pour
 * l'historique — et que le SQL des non-lus. Elle est répétée ici parce que la bulle reçoit
 * l'appel brut. Les trois doivent rester alignées. `declined` n'en est pas : refuser, c'est
 * savoir qu'on a été appelé.
 */
export const isMissedCall = (call: CallInfo, me: string | null) =>
  call.receiverId === me && (call.status === 'missed' || call.status === 'cancelled');

/** Un appel qui sonne encore, ou dont la conversation a lieu en ce moment. */
export const isLiveCall = (call: CallInfo) => call.status === 'pending' || call.status === 'accepted';

/** L'appel brut d'une bulle, vu par le lecteur. */
export const callFacts = (call: CallInfo, me: string | null): CallFacts => ({
  outgoing: call.callerId === me,
  missed: isMissedCall(call, me),
  duration: call.duration,
  status: call.status,
});

/**
 * Ce qu'a été l'appel, en un mot.
 *
 * ⚠️ « Manqué » ne se dit que chez celui qui était appelé (voir `isMissedCall`) ; pour
 * l'appelant, le même appel est « sans réponse ».
 * ⚠️ « Décroché » se lit sur le STATUT `ended`, pas sur la durée : un appel décroché puis
 * raccroché dans la seconde dure 0 s, et `0` se lirait « sans réponse ».
 */
export const callKind = (item: CallFacts) => {
  if (item.status === 'pending' || item.status === 'accepted') return 'live' as const;
  if (item.missed) return 'missed' as const;
  if (item.status === 'ended') return item.outgoing ? ('outgoing' as const) : ('incoming' as const);
  if (item.outgoing) return item.status === 'cancelled' ? ('cancelled' as const) : ('no_answer' as const);
  // Appelé, non manqué, non abouti : il a refusé lui-même.
  return 'declined' as const;
};

const LABEL_KEYS = {
  live: 'calls.history_live',
  missed: 'calls.missed',
  no_answer: 'calls.no_answer',
  cancelled: 'calls.history_cancelled',
  declined: 'calls.history_declined',
  outgoing: 'calls.history_outgoing',
  incoming: 'calls.history_incoming',
} as const;

export const callLabel = (item: CallFacts, t: (k: string) => string) => t(LABEL_KEYS[callKind(item)]);

/** Icône du sens : la flèche dit qui a appelé, comme sur l'app Téléphone. */
export const callIcon = (item: Pick<CallItem, 'outgoing'>) =>
  item.outgoing ? ('arrow-up-outline' as const) : ('arrow-down-outline' as const);

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const yesterdayOf = (now: Date) => {
  const d = new Date(now);
  d.setDate(now.getDate() - 1);
  return d;
};

const pad = (n: number) => n.toString().padStart(2, '0');

/**
 * « 26/09/2026 » — formatée À LA MAIN, chiffre par chiffre.
 *
 * ⚠️ Pas de `toLocaleDateString` ici : il suit la langue du TÉLÉPHONE, pas celle de l'app.
 * Un iPhone réglé en anglais affichait « Friday, September 26, 2026 » dans une app en
 * français (remarque de Berke, 26/09). JJ/MM/AAAA est demandé tel quel, dans toutes les
 * langues de l'app.
 */
export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** « 20:08 » — sur 24 h, même raison : sans cela un téléphone en anglais américain écrit « 8:08 PM ». */
export const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Horodatage d'une ligne de l'onglet Récents : l'heure aujourd'hui, « Hier », sinon
 * JJ/MM/AAAA.
 *
 * ⚠️ Plus de nom du jour pour la semaine écoulée (26/09, demande de Berke) : il sortait dans
 * la langue du TÉLÉPHONE (« Friday » dans une app en français). La date chiffrée se lit dans
 * toutes les langues.
 */
export const formatListDate = (iso: string, t: TFunction) => {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return formatTime(iso);
  if (sameDay(date, yesterdayOf(now))) return t('time.yesterday');
  return formatDate(iso);
};

/** En-tête d'un jour dans la fiche : « Aujourd'hui », « Hier », sinon JJ/MM/AAAA. */
export const formatDayHeading = (iso: string, t: TFunction) => {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return t('calls.today');
  if (sameDay(date, yesterdayOf(now))) return t('time.yesterday');
  return formatDate(iso);
};

/** Une ligne de la liste : un ou plusieurs appels consécutifs avec la même personne. */
export type CallGroup = { key: string; latest: CallItem; count: number };

/**
 * Regroupe les appels CONSÉCUTIFS avec la même personne et de même nature, comme l'app
 * Téléphone : trois appels manqués d'affilée d'Alice deviennent « Alice (3) ».
 *
 * ⚠️ « Même nature » = même LIBELLÉ (`callKind`) : manqué, sans réponse, annulé, sortant,
 * entrant. La ligne n'affiche que le libellé du plus récent ; regrouper des appels de
 * natures différentes le ferait mentir sur tous les autres — un premier essai qui ne
 * séparait que les manqués donnait « Alice (30) · Appel sortant » pour trente appels dans
 * les deux sens. Et mêler un manqué à des appels aboutis cacherait le rouge.
 *
 * ⚠️ Consécutifs seulement, jamais « tous les appels avec Alice » : un appel avec quelqu'un
 * d'autre entre deux rompt le groupe, sinon la liste ne serait plus chronologique.
 *
 * La ligne affiche le plus RÉCENT du groupe (la liste arrive du plus récent au plus ancien) ;
 * le détail de chacun reste dans la fiche d'appel.
 */
export const groupCalls = (items: CallItem[]): CallGroup[] => {
  const groups: CallGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.latest.peer.id === item.peer.id && callKind(last.latest) === callKind(item)) {
      last.count += 1;
    } else {
      groups.push({ key: item.id, latest: item, count: 1 });
    }
  }
  return groups;
};
