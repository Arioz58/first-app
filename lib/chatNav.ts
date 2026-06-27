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
