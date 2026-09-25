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
 * Ce qu'a été l'appel, en un mot.
 *
 * ⚠️ « Manqué » ne se dit que chez celui qui n'a pas décroché (le serveur le calcule) ; pour
 * l'appelant, le même appel est « sans réponse ». Un appel qui a duré, dans un sens ou dans
 * l'autre, est simplement « sortant » ou « entrant ».
 *
 * ⚠️ Reste un cas : un appel ENTRANT sans durée et non manqué — l'appelant a raccroché avant
 * qu'on décroche (`cancelled`, que le serveur ne compte pas comme manqué). D'où « annulé ».
 */
export const callKind = (item: CallItem) => {
  if (item.missed) return 'missed' as const;
  if (!item.duration) return item.outgoing ? ('no_answer' as const) : ('cancelled' as const);
  return item.outgoing ? ('outgoing' as const) : ('incoming' as const);
};

const LABEL_KEYS = {
  missed: 'calls.missed',
  no_answer: 'calls.no_answer',
  cancelled: 'calls.history_cancelled',
  outgoing: 'calls.history_outgoing',
  incoming: 'calls.history_incoming',
} as const;

export const callLabel = (item: CallItem, t: TFunction) => t(LABEL_KEYS[callKind(item)]);

/** Icône du sens : la flèche dit qui a appelé, comme sur l'app Téléphone. */
export const callIcon = (item: CallItem) =>
  item.outgoing ? ('arrow-up-outline' as const) : ('arrow-down-outline' as const);

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const yesterdayOf = (now: Date) => {
  const d = new Date(now);
  d.setDate(now.getDate() - 1);
  return d;
};

/**
 * Horodatage d'une ligne de la liste : l'heure aujourd'hui, « Hier », le jour de la semaine
 * dans les 7 derniers jours, la date au-delà — la même échelle que l'app Téléphone.
 */
export const formatListDate = (iso: string, t: TFunction) => {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay(date, yesterdayOf(now))) return t('time.yesterday');
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) return date.toLocaleDateString([], { weekday: 'long' });
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

/** En-tête d'un jour dans la fiche : « Aujourd'hui », « Hier », sinon la date en toutes lettres. */
export const formatDayHeading = (iso: string, t: TFunction) => {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return t('calls.today');
  if (sameDay(date, yesterdayOf(now))) return t('time.yesterday');
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
