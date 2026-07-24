// Relais en mémoire (même principe que `chatNav`) : le FAB de la page Messages
// demande à l'onglet Contacts de s'ouvrir sur un segment précis.
// Un paramètre de route ne conviendrait pas : sa valeur ne changeant pas d'un
// appel à l'autre, l'effet ne se redéclencherait pas au 2ᵉ passage.
export type ContactsSegment = 'search' | 'friends';

let pending: ContactsSegment | null = null;

export const requestContactsSegment = (segment: ContactsSegment) => {
  pending = segment;
};

// Consomme le segment demandé (one-shot).
export const consumeContactsSegment = (): ContactsSegment | null => {
  const segment = pending;
  pending = null;
  return segment;
};
