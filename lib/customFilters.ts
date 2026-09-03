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
  conversationIds: string[];
};

export const fetchCustomFilters = () => apiRequest<CustomFilter[]>('/filters');

export const createCustomFilter = (name: string, conversationIds: string[]) =>
  apiRequest<CustomFilter>('/filters', {
    method: 'POST',
    body: { name, conversationIds },
  });

export const updateCustomFilter = (
  id: string,
  data: { name?: string; conversationIds?: string[] },
) => apiRequest<CustomFilter>(`/filters/${id}`, { method: 'PATCH', body: data });

export const deleteCustomFilter = (id: string) =>
  apiRequest(`/filters/${id}`, { method: 'DELETE' });
