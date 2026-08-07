/**
 * Apparition des médias distants.
 *
 * Une image du fil n'est pas dans le cache au premier affichage : sa bulle est déjà
 * dimensionnée, mais son contenu arrive après. Sans rien, on regarde un trou vide puis
 * l'image surgit d'un coup — le même inconfort que les actions sans retour, appliqué au
 * contenu.
 *
 * Deux réglages suffisent : un fond neutre pendant l'attente, et un fondu court à
 * l'arrivée. `expo-image` les gère nativement, sans coût ni composant supplémentaire.
 */

/**
 * Gris neutre en semi-transparence, et non une couleur de thème : ces vues sont posées sur
 * des fonds très variés (bulle blanche, bulle en dégradé, fond de conversation, visionneuse
 * noire). Un gris translucide se pose correctement sur tous, là où une couleur opaque
 * jurerait sur au moins l'un d'eux — et il évite d'avoir à passer le thème à chaque tuile.
 */
export const MEDIA_PLACEHOLDER = 'rgba(128,128,128,0.18)';

/**
 * Fondu d'arrivée. Court volontairement : au-delà, une image déjà en cache — le cas le plus
 * fréquent en défilant — semble mettre du temps à s'afficher alors qu'elle est là.
 */
export const MEDIA_FADE_MS = 180;
