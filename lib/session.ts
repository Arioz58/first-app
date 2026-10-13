/**
 * Relais vers le démarrage de session de `app/_layout.tsx` (écouteurs d'appel et de
 * bandeaux, jeton VoIP, écran d'appel du système).
 *
 * ⚠️ Un relais plutôt qu'un import direct : un écran n'importe pas le layout racine, qui est
 * un fichier de route. Le layout s'inscrit ici au chargement du module, donc bien avant que
 * l'écran de connexion puisse appeler `startSession`.
 */
let starter: (() => void) | null = null;

export const setSessionStarter = (fn: () => void) => {
  starter = fn;
};

export const startSession = () => starter?.();
