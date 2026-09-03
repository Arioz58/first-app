import { apiRequest } from './api';

/**
 * Filtres personnalisés de la liste des conversations — le « + » de la barre de filtres.
 *
 * ⚠️ Stockés CÔTÉ SERVEUR, contrairement au fond de conversation ou au surnom qui vivent en
 * SecureStore : ce n'est pas de la cosmétique mais une liste composée à la main. La perdre
 * en changeant de téléphone se remarquerait.
 */

export type CustomFilter = {
  id: string;
  name: string;
  /** Pastille affichée sur les conversations du filtre, en `#RRGGBB`. */
  color: string;
  conversationIds: string[];
};

/**
 * Modèles proposés à la création — un nom et une couleur, rien de plus.
 *
 * ⚠️ Ce ne sont PAS des filtres tout faits : le contenu (quelles conversations) reste à
 * choisir, et un modèle choisi devient un filtre ordinaire, renommable et recolorable. Ils
 * n'existent que pour éviter la page blanche « nom + couleur » à chaque création.
 *
 * ⚠️ `key` est une clé i18n, pas un libellé : le nom est traduit à l'affichage puis ENVOYÉ
 * en clair au serveur. Un filtre garde donc le nom de la langue dans laquelle il a été créé
 * — c'est voulu, l'utilisateur peut le renommer, et traduire après coup un nom qu'il a peut-
 * être modifié serait pire.
 */
export const FILTER_PRESETS: { key: string; color: string }[] = [
  { key: 'work', color: '#1E40AF' },
  { key: 'family', color: '#16A34A' },
  { key: 'friends', color: '#F59E0B' },
  { key: 'important', color: '#DC2626' },
  { key: 'projects', color: '#7C3AED' },
  { key: 'later', color: '#0891B2' },
];

/**
 * Palette de pastilles.
 *
 * ⚠️ Volontairement restreinte : une roue chromatique libre produirait des couleurs
 * illisibles sur fond clair ou sombre, alors que ces six-là sont contrastées dans les deux.
 */
export const FILTER_COLORS = FILTER_PRESETS.map((p) => p.color);

export const fetchCustomFilters = () => apiRequest<CustomFilter[]>('/filters');

export const createCustomFilter = (name: string, conversationIds: string[], color: string) =>
  apiRequest<CustomFilter>('/filters', {
    method: 'POST',
    body: { name, conversationIds, color },
  });

export const updateCustomFilter = (
  id: string,
  data: { name?: string; conversationIds?: string[]; color?: string },
) => apiRequest<CustomFilter>(`/filters/${id}`, { method: 'PATCH', body: data });

export const deleteCustomFilter = (id: string) =>
  apiRequest(`/filters/${id}`, { method: 'DELETE' });
