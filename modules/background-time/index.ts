import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Temps d'exécution en arrière-plan (voir `ios/BackgroundTimeModule.swift`).
 *
 * ⚠️ `requireOptionalNativeModule` et non `requireNativeModule` : un build installé AVANT
 * l'ajout de ce module n'a pas le code natif. Il ne doit pas planter pour autant — il
 * retombe simplement sur l'ancien comportement (pas de temps supplémentaire).
 */
type Native = { begin(name: string): Promise<string>; end(key: string): Promise<void> };
const native = requireOptionalNativeModule<Native>('BackgroundTime');

/**
 * Exécute `work` en demandant au système de ne pas suspendre l'app avant la fin.
 * La tâche est TOUJOURS rendue, que `work` réussisse ou échoue.
 */
export async function withBackgroundTime<T>(name: string, work: () => Promise<T>): Promise<T> {
  let key = '';
  try {
    key = (await native?.begin(name)) ?? '';
  } catch {
    // Refusé ou indisponible : on travaille quand même, sans filet.
  }
  try {
    return await work();
  } finally {
    if (key) native?.end(key).catch(() => {});
  }
}
