import { makeMutable } from 'react-native-reanimated';

/**
 * Recul de l'écran quand une feuille s'ouvre (l'empilement de cartes d'iOS) : l'écran du
 * dessous rétrécit et ses coins s'arrondissent, la feuille se pose par-dessus.
 *
 * ⚠️ Les feuilles vivent dans un `Modal`, donc dans une hiérarchie de vues distincte de
 * celle de l'écran : depuis l'intérieur, impossible de transformer ce qu'il y a derrière.
 * D'où cette valeur déclarée AU NIVEAU MODULE — une shared value Reanimated n'appartient
 * pas à l'arbre React, les deux côtés lisent le même objet et l'animation reste sur le
 * thread UI. Un état React ou un store JS obligerait à repasser par le thread JS à chaque
 * image, ce qui hacherait le suivi du doigt pendant le glissement de fermeture.
 *
 * 0 = écran au repos, 1 = feuille entièrement ouverte. Suit le geste, pas seulement
 * l'ouverture : refermer la feuille au doigt fait remonter l'écran progressivement.
 */
export const sheetRecede = makeMutable(0);

/**
 * Seule la feuille la PLUS BASSE pilote le recul. Une feuille ouverte par-dessus une autre
 * (le sélecteur de pays dans le drawer d'ajout de contact) ne doit pas faire reculer
 * l'écran une seconde fois — il l'est déjà.
 */
let openSheets = 0;

/** À l'ouverture : renvoie `true` si cette feuille est celle qui pilote le recul. */
export const claimRecede = (): boolean => {
  openSheets += 1;
  return openSheets === 1;
};

export const releaseRecede = (wasDriver: boolean) => {
  openSheets = Math.max(0, openSheets - 1);
  if (wasDriver) sheetRecede.value = 0;
};
