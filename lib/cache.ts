import * as FileSystem from 'expo-file-system/legacy';

/**
 * MÉMOIRE LOCALE de l'application — ce qu'elle sait déjà avant d'avoir parlé au serveur.
 *
 * ⚠️ POURQUOI : jusqu'ici, chaque écran demandait TOUT au serveur avant d'afficher quoi que
 * ce soit, derrière un indicateur de chargement plein écran. Le serveur répond en quelques
 * millisecondes en local, mais en ~250 ms depuis Railway (mesuré le 11/09) — et davantage sur
 * un réseau mobile turc, avec un historique volumineux. L'utilisateur voit donc un écran vide
 * à chaque ouverture. C'est le reproche du client : « sur WhatsApp, dès que tu ouvres, tout
 * est là à la milliseconde ».
 *
 * ⚠️ CE N'EST PAS UN CACHE DE REQUÊTES. On ne cherche pas à éviter l'appel réseau — il part
 * toujours, et le serveur fait toujours foi. On cherche à avoir quelque chose à MONTRER
 * pendant qu'il voyage. La conséquence assumée est qu'on affiche brièvement un état d'il y a
 * quelques secondes, corrigé dès la réponse.
 *
 * ⚠️ LECTURE SYNCHRONE OBLIGATOIRE. Un premier rendu ne peut pas attendre une promesse :
 * l'écran serait vide le temps de la lecture disque, et on aurait juste déplacé le problème.
 * D'où la copie en mémoire, remplie pendant l'écran de démarrage par `hydrateCache()`, et
 * `readCache()` qui lit cette copie sans rien attendre.
 *
 * ⚠️ CLOISONNÉ PAR COMPTE (`cache/<userId>/`). Sans cela, changer de compte sur un même
 * téléphone montrerait les conversations du précédent pendant une seconde — une fuite de
 * données entre comptes, pas un défaut d'affichage. `clearCache` est appelé à la déconnexion,
 * mais le cloisonnement protège même si elle ne l'est pas (arrêt brutal, réinstallation).
 *
 * ⚠️ Sur disque, en clair, dans le bac à sable de l'app — comme les médias déjà téléchargés.
 * Ce n'est PAS du SecureStore : celui-ci est fait pour des secrets courts (jetons) et le
 * traverser pour des listes entières serait lent. Sur iOS, ces fichiers restent couverts par
 * la protection de données de l'appareil.
 */

const ROOT = `${FileSystem.documentDirectory}cache/`;

/**
 * Copie mémoire, seule source des lectures synchrones.
 *
 * ⚠️ `undefined` = jamais chargé, `null` = chargé et vide. La distinction porte une décision
 * d'affichage : sans cache connu il faut un indicateur de chargement, avec un cache vide il
 * faut l'écran « aucune conversation ».
 */
const memory = new Map<string, unknown>();

/** Compte auquel appartient la mémoire actuelle. */
let owner: string | null = null;

/** Écritures en attente, regroupées — voir `writeCache`. */
const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Délai de regroupement des écritures.
 *
 * ⚠️ La liste des conversations est réécrite à CHAQUE message reçu. Sans ce délai, une
 * conversation animée déclencherait une écriture disque par message — du travail inutile sur
 * le fil principal, pour un fichier qui sera de toute façon réécrit une seconde plus tard.
 */
const FLUSH_DELAY = 600;

const fileFor = (key: string) => `${ROOT}${owner}/${key}.json`;

const flush = async () => {
  flushTimer = null;
  if (!owner || !pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    await FileSystem.makeDirectoryAsync(`${ROOT}${owner}`, { intermediates: true });
    await Promise.all(
      batch.map(([key, value]) =>
        FileSystem.writeAsStringAsync(fileFor(key), JSON.stringify(value)),
      ),
    );
  } catch {
    // Disque plein, dossier supprimé sous nos pieds : la mémoire reste juste, et l'app
    // fonctionne — elle repartira simplement d'un écran vide au prochain lancement. Rien
    // ici ne justifie de déranger l'utilisateur.
  }
};

/**
 * Charge en mémoire les clés dont le PREMIER RENDU a besoin.
 *
 * ⚠️ À appeler pendant l'écran de démarrage, avant de rendre l'application — c'est le seul
 * moment où attendre une lecture disque ne coûte rien, puisqu'on attend déjà le trousseau.
 *
 * ⚠️ Ne PAS y charger tout ce qui est en cache : les clés lourdes (l'historique d'une
 * conversation) se chargeraient à l'ouverture de leur écran, avec `loadCache`.
 */
export const hydrateCache = async (userId: string, keys: string[]): Promise<void> => {
  if (owner !== userId) {
    // Compte différent de celui en mémoire : on repart de zéro plutôt que de mélanger.
    memory.clear();
    pending.clear();
    owner = userId;
  }
  await Promise.all(
    keys.map(async (key) => {
      try {
        const raw = await FileSystem.readAsStringAsync(fileFor(key));
        memory.set(key, JSON.parse(raw));
      } catch {
        // Absent ou illisible (écriture interrompue, format changé) : on ne garde rien. Un
        // cache douteux qu'on affiche est pire qu'un écran de chargement d'une demi-seconde.
        memory.set(key, null);
      }
    }),
  );
};

/**
 * Lecture SYNCHRONE, depuis la mémoire.
 *
 * `null` = rien en cache (jamais chargé, ou vide). C'est la valeur à tester pour décider
 * d'afficher un indicateur de chargement.
 */
export const readCache = <T>(key: string): T | null => (memory.get(key) as T) ?? null;

/** Charge une clé à la demande (historique d'une conversation, par exemple). */
export const loadCache = async <T>(key: string): Promise<T | null> => {
  const known = memory.get(key);
  if (known !== undefined) return (known as T) ?? null;
  if (!owner) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(fileFor(key));
    const value = JSON.parse(raw);
    memory.set(key, value);
    return value as T;
  } catch {
    memory.set(key, null);
    return null;
  }
};

/**
 * Enregistre une valeur : immédiatement en mémoire, sur disque un peu plus tard.
 *
 * ⚠️ La mémoire est mise à jour TOUT DE SUITE : c'est elle que lira l'écran suivant, et
 * attendre l'écriture disque rendrait le cache en retard sur ce qui est affiché.
 */
export const writeCache = (key: string, value: unknown): void => {
  if (!owner) return;
  memory.set(key, value);
  pending.set(key, value);
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY);
};

/**
 * Efface tout le cache du compte courant.
 *
 * ⚠️ À la déconnexion, et AVANT d'effacer la session : on a besoin de savoir de quel compte
 * il s'agit. Les écritures en attente sont annulées, sinon la suivante recréerait le dossier
 * qu'on vient de supprimer.
 */
export const clearCache = async (): Promise<void> => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  pending.clear();
  memory.clear();
  const previous = owner;
  owner = null;
  if (!previous) return;
  try {
    await FileSystem.deleteAsync(`${ROOT}${previous}`, { idempotent: true });
  } catch {
    // Rien à faire de plus : la mémoire est déjà vidée, et le cloisonnement par compte
    // empêche le compte suivant de lire ce qui resterait sur le disque.
  }
};

/**
 * Noms des entrées, déclarés ici plutôt qu'écrits à la main sur place.
 *
 * ⚠️ La liste des conversations est lue par PLUSIEURS écrans (l'onglet Discussion, le
 * sélecteur de destinataires après une photo) : deux orthographes donneraient deux caches, et
 * l'un des deux ne serait jamais rafraîchi.
 */
export const CACHE_CONVERSATIONS = 'conversations';
export const CACHE_FRIENDS = 'friends';

/** Clés chargées au démarrage. Y ajouter une clé lourde ralentirait le lancement. */
export const BOOT_KEYS = [CACHE_CONVERSATIONS, CACHE_FRIENDS] as const;
