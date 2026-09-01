import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { UserAvatar } from './UserAvatar';

type Member = { id: string; name: string; photoUrl?: string | null };
/** Accusés d'un membre, tels que le fil les entretient déjà. */
type Receipt = { delivered?: string; read?: string };

const when = (iso?: string) =>
  iso
    ? `${new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} ${new Date(
        iso,
      ).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : '';

/**
 * Statuts détaillés d'un message, membre par membre.
 *
 * ⚠️ Aucune requête : tout se déduit de ce que l'écran a déjà — la date du message et les
 * accusés par membre (`lastDeliveredAt` / `lastReadAt`), qui arrivent avec les métadonnées de
 * la conversation et sont entretenus par les événements. Un endpoint dédié ferait une
 * SECONDE source de vérité pour la même information, et les deux finiraient par diverger.
 *
 * ⚠️ Le réglage « accusés de lecture » est déjà appliqué côté serveur : quand il est coupé,
 * `lastReadAt` n'arrive tout simplement pas, et cet écran affiche « remis » sans « lu ». Rien
 * à filtrer ici — ce qu'on ne reçoit pas ne peut pas fuiter.
 */
export function MessageInfoSheet({
  visible,
  onClose,
  sentAt,
  members,
  receipts,
}: {
  visible: boolean;
  onClose: () => void;
  /** Date d'envoi du message dont on montre les statuts. */
  sentAt: string | null;
  /** Les autres membres de la conversation (moi exclu). */
  members: Member[];
  receipts: Record<string, Receipt>;
}) {
  const { t } = useTranslation();
  const sent = sentAt ? new Date(sentAt).getTime() : 0;

  // Un membre a « reçu » (ou « lu ») ce message quand son accusé a dépassé sa date d'envoi.
  const stateOf = (userId: string) => {
    const r = receipts[userId] ?? {};
    const read = r.read && new Date(r.read).getTime() >= sent ? r.read : undefined;
    const delivered =
      r.delivered && new Date(r.delivered).getTime() >= sent ? r.delivered : undefined;
    return { read, delivered };
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      height={Math.min(460, 190 + members.length * 64)}
    >
      <View className="px-5 pb-3">
        <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
          {t('chat.message_info')}
        </Text>
        {sentAt && (
          <View className="flex-row items-center mt-2">
            <Ionicons name="checkmark" size={15} color="#9CA3AF" />
            <Text className="text-sm text-gray-500 dark:text-zinc-400 ml-1.5">
              {t('chat.info_sent')} · {when(sentAt)}
            </Text>
          </View>
        )}
      </View>

      <ScrollView className="px-3">
        {members.map((m) => {
          const { read, delivered } = stateOf(m.id);
          return (
            <View key={m.id} className="flex-row items-center px-2 py-2.5">
              <UserAvatar name={m.name} photoUrl={m.photoUrl} size={40} />
              <View className="flex-1 ml-3">
                <Text className="text-base text-gray-900 dark:text-zinc-100">{m.name}</Text>
                <Text className="text-sm text-gray-400 dark:text-zinc-500">
                  {read
                    ? `${t('chat.info_read')} · ${when(read)}`
                    : delivered
                      ? `${t('chat.info_delivered')} · ${when(delivered)}`
                      : t('chat.info_pending')}
                </Text>
              </View>
              <Ionicons
                name={read || delivered ? 'checkmark-done' : 'time-outline'}
                size={18}
                // Bleu pour « lu », gris pour le reste : la même convention que les coches
                // de la bulle, sinon on aurait deux langages pour un seul état.
                color={read ? '#38BDF8' : '#9CA3AF'}
              />
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
