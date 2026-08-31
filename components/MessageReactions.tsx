import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import BottomSheet from './BottomSheet';
import { UserAvatar } from './UserAvatar';

export type Reaction = { userId: string; emoji: string };
type Member = { id: string; name: string; photoUrl?: string | null };

/** Regroupe par emoji, dans l'ordre d'apparition, avec le compte et « ai-je réagi ». */
export const groupReactions = (reactions: Reaction[], currentUserId: string) => {
  const order: string[] = [];
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const entry = byEmoji.get(r.emoji);
    if (entry) {
      entry.count += 1;
      entry.mine = entry.mine || r.userId === currentUserId;
    } else {
      order.push(r.emoji);
      byEmoji.set(r.emoji, { emoji: r.emoji, count: 1, mine: r.userId === currentUserId });
    }
  }
  return order.map((e) => byEmoji.get(e)!);
};

/**
 * Pastilles de réactions, posées sous la bulle.
 *
 * ⚠️ Un léger chevauchement vers le haut (`marginTop` négatif) plutôt qu'une ligne à part :
 * la pastille appartient visuellement à la bulle. Détachée, elle se lit comme un message de
 * plus, et l'espacement des séries s'en trouve doublé.
 */
export function MessageReactions({
  reactions,
  currentUserId,
  isMe,
  onPress,
}: {
  reactions: Reaction[];
  currentUserId: string;
  isMe: boolean;
  onPress: () => void;
}) {
  if (!reactions.length) return null;
  const groups = groupReactions(reactions, currentUserId);

  return (
    <Animated.View
      // Fondu seul, sans ressort d'échelle : cf. la règle d'animation du projet.
      entering={FadeIn.duration(180)}
      style={{ marginTop: -8, zIndex: 1 }}
      className={`flex-row ${isMe ? 'self-end' : 'self-start'} ${isMe ? 'mr-1' : 'ml-1'}`}
    >
      <Pressable
        onPress={onPress}
        className="flex-row items-center gap-1 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-2 py-0.5"
      >
        {groups.map((g) => (
          <View key={g.emoji} className="flex-row items-center">
            <Text style={{ fontSize: 13 }}>{g.emoji}</Text>
            {g.count > 1 && (
              <Text
                className={`text-xs ml-0.5 ${
                  g.mine ? 'text-nexa font-semibold' : 'text-gray-500 dark:text-zinc-400'
                }`}
              >
                {g.count}
              </Text>
            )}
          </View>
        ))}
      </Pressable>
    </Animated.View>
  );
}

/**
 * « Qui a réagi » : la liste, avec l'emoji de chacun.
 *
 * ⚠️ Les noms viennent des MEMBRES déjà chargés (`GET /conversations/:id`), pas d'une
 * requête dédiée : le fil ne transporte que `userId` + `emoji` pour ne pas faire une
 * jointure par message et par page. Un membre parti du groupe n'a donc plus de nom — on
 * affiche alors un libellé neutre plutôt qu'une ligne vide.
 */
export function ReactionsSheet({
  visible,
  reactions,
  members,
  currentUserId,
  onClose,
  onRemoveMine,
}: {
  visible: boolean;
  reactions: Reaction[];
  members: Member[];
  currentUserId: string;
  onClose: () => void;
  onRemoveMine: () => void;
}) {
  const { t } = useTranslation();
  const byId = new Map(members.map((m) => [m.id, m]));

  return (
    <BottomSheet visible={visible} onClose={onClose} height={Math.min(420, 120 + reactions.length * 62)}>
      <View className="px-5 pb-2">
        <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
          {t('chat.reactions_title', { count: reactions.length })}
        </Text>
      </View>
      <ScrollView className="px-3">
        {reactions.map((r) => {
          const member = byId.get(r.userId);
          const mine = r.userId === currentUserId;
          return (
            <Pressable
              key={r.userId}
              onPress={mine ? onRemoveMine : undefined}
              className="flex-row items-center px-2 py-2.5"
            >
              <UserAvatar name={member?.name ?? '?'} photoUrl={member?.photoUrl} size={42} />
              <View className="flex-1 ml-3">
                <Text className="text-base text-gray-900 dark:text-zinc-100">
                  {mine ? t('chat.quote_you') : member?.name ?? t('chat.former_member')}
                </Text>
                {mine && (
                  <Text className="text-sm text-gray-400 dark:text-zinc-500">
                    {t('chat.tap_to_remove')}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 24 }}>{r.emoji}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
