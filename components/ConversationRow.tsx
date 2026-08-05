import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { UserAvatar } from './UserAvatar';

/**
 * Une ligne de la liste des conversations.
 *
 * Extraite pour être partagée entre la liste principale et les archives : les deux écrans
 * affichent exactement la même chose, seuls les gestes qui l'entourent changent.
 */
export type RowMember = {
  userId: string;
  user: { id: string; name: string; photoUrl: string | null };
};

export type RowMessage = {
  id: string;
  senderId: string;
  content: string | null;
  type: string;
  mediaType: string | null;
  createdAt: string;
  conversationId?: string;
};

export type RowConversation = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  photoUrl: string | null;
  members: RowMember[];
  messages: RowMessage[];
  unreadCount: number;
  manualUnread: boolean;
  pinnedAt: string | null;
  favoritedAt: string | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  lastMessageAt: string;
};

export const otherMemberOf = (conv: RowConversation, currentUserId: string | null) =>
  conv.members.find((m) => m.userId !== currentUserId);

export const isConversationMuted = (conv: RowConversation) =>
  !!conv.mutedUntil && new Date(conv.mutedUntil) > new Date();

/** Non lue « pour de vrai », ou remise en non lu à la main. */
export const isConversationUnread = (conv: RowConversation) =>
  conv.unreadCount > 0 || conv.manualUnread;

export function useConversationLabels(currentUserId: string | null) {
  const { t } = useTranslation();

  const getConvName = (conv: RowConversation) => {
    if (conv.type === 'group') return conv.name ?? t('chat.group');
    return otherMemberOf(conv, currentUserId)?.user.name ?? t('chat.unknown');
  };

  // Traduit un message système (content JSON { k, by, … }) pour l'aperçu.
  const systemText = (raw?: string | null): string => {
    if (!raw) return '';
    try {
      const { k, dur, ...params } = JSON.parse(raw);
      if (dur) params.duration = t(`ephemeral.${dur}`) as string;
      if (params.role) params.role = t(`roles.${params.role}`) as string;
      return t(`system.${k}`, params) as string;
    } catch {
      return '';
    }
  };

  // Aperçu du dernier message : les pièces jointes n'ont pas de texte.
  const getLastMessage = (conv: RowConversation) => {
    const msg = conv.messages[0];
    if (!msg) return t('chat.no_messages');
    if (msg.type === 'system') return systemText(msg.content);
    if (msg.mediaType) return t(`preview.${msg.mediaType}`, { defaultValue: t('chat.media') });
    return msg.content ?? t('chat.media');
  };

  // Aujourd'hui → heure, hier → « Hier », au-delà → date courte.
  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday');
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  };

  return { getConvName, getLastMessage, formatDate };
}

export function ConversationRow({
  conv,
  currentUserId,
  onPress,
  onLongPress,
}: {
  conv: RowConversation;
  currentUserId: string | null;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { getConvName, getLastMessage, formatDate } = useConversationLabels(currentUserId);
  const other = otherMemberOf(conv, currentUserId);
  const unread = isConversationUnread(conv);

  return (
    <TouchableOpacity
      // Fond opaque obligatoire : il masque les actions de glissement qui vivent dessous.
      className="flex-row items-center px-4 py-3.5 border-b border-gray-50 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      {conv.type === 'group' ? (
        <UserAvatar photoUrl={conv.photoUrl} size={56} group />
      ) : (
        <UserAvatar photoUrl={other?.user.photoUrl} name={other?.user.name} size={56} />
      )}

      <View className="flex-1 ml-3.5">
        <View className="flex-row items-center">
          {conv.pinnedAt && (
            <Ionicons name="pin" size={15} color="#9CA3AF" style={{ marginRight: 4 }} />
          )}
          <Text
            className="font-semibold text-gray-900 dark:text-zinc-100 flex-shrink"
            numberOfLines={1}
          >
            {getConvName(conv)}
          </Text>
          {conv.favoritedAt && (
            <Ionicons name="star" size={15} color="#F59E0B" style={{ marginLeft: 4 }} />
          )}
          {isConversationMuted(conv) && (
            <Ionicons
              name="notifications-off"
              size={15}
              color="#9CA3AF"
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
        <Text
          className={`text-base ${unread ? 'text-gray-900 dark:text-zinc-100 font-medium' : 'text-gray-500 dark:text-zinc-400'}`}
          numberOfLines={1}
        >
          {getLastMessage(conv)}
        </Text>
      </View>

      <View className="items-end ml-2">
        <Text
          className={`text-sm ${unread ? 'text-nexa font-semibold' : 'text-gray-400 dark:text-zinc-500'}`}
        >
          {formatDate(conv.lastMessageAt)}
        </Text>
        {/* Non lu à la main = pastille SANS nombre : aucun message n'attend réellement. */}
        {conv.unreadCount > 0 ? (
          <View className="bg-nexa rounded-full min-w-[24px] h-[24px] items-center justify-center px-1.5 mt-1">
            <Text className="text-white text-sm font-bold">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </Text>
          </View>
        ) : conv.manualUnread ? (
          <View className="bg-nexa rounded-full w-3 h-3 mt-2 mr-1.5" />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
