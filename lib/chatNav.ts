// Petit relais en mémoire : le panneau de détails demande à l'écran de chat
// de défiler jusqu'à un message (épinglé / favori) puis de le surligner.
let pending: { conversationId: string; messageId: string } | null = null;

export const requestScrollToMessage = (conversationId: string, messageId: string) => {
  pending = { conversationId, messageId };
};

// Consomme la cible si elle concerne cette conversation (one-shot).
export const consumeScrollTarget = (conversationId: string): string | null => {
  if (pending && pending.conversationId === conversationId) {
    const id = pending.messageId;
    pending = null;
    return id;
  }
  return null;
};

// Même relais pour « Rechercher » du panneau de détails : le chat ouvre sa barre de recherche
// au retour (la recherche vit dans le chat, où sont les messages à parcourir).
let searchFor: string | null = null;

export const requestOpenSearch = (conversationId: string) => {
  searchFor = conversationId;
};

export const consumeOpenSearch = (conversationId: string): boolean => {
  if (searchFor !== conversationId) return false;
  searchFor = null;
  return true;
};
