import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { setPendingFriendRequests } from '../lib/friendRequests';
import { UserAvatar } from './UserAvatar';

type Friend = { id: string; name: string; photoUrl: string | null };
type RequestItem = {
  requestId: string;
  createdAt: string;
  user: Friend;
};

type Sub = 'friends' | 'received' | 'sent';

export function FriendsPanel({
  onOpenProfile,
}: {
  onOpenProfile: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<Sub>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [received, setReceived] = useState<RequestItem[]>([]);
  const [sent, setSent] = useState<RequestItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r, s] = await Promise.all([
        apiRequest<Friend[]>('/friends'),
        apiRequest<RequestItem[]>('/friends/requests/received'),
        apiRequest<RequestItem[]>('/friends/requests/sent'),
      ]);
      setFriends(f);
      setReceived(r);
      setSent(s);
      // `load()` est rejoué au focus et après chaque accept/refuse : c'est le
      // point unique qui resynchronise le badge de l'onglet Contacts.
      setPendingFriendRequests(r.length);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /**
   * Identifiant de l'action en cours, ou `null`.
   *
   * ⚠️ Un identifiant et non un booléen : c'est une LISTE, et un drapeau global ne dirait
   * pas SUR QUELLE ligne l'attente porte. On veut animer le bouton sur lequel le doigt
   * vient d'appuyer, pas tous.
   *
   * ⚠️ Chaque action enchaîne un aller-retour réseau PUIS un rechargement complet de la
   * liste. Sans garde, le bouton restait actif pendant tout ce temps : rien ne signalait
   * que l'appui avait été pris, et un second appui envoyait une seconde acceptation.
   */
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setBusyId(null);
    }
  };

  // ⚠️ La clé porte l'ACTION en plus de l'identifiant : accepter et refuser concernent la
  // même demande, et une clé réduite à l'identifiant ferait tourner les DEUX boutons.
  const accept = (id: string) =>
    run(`accept:${id}`, () => apiRequest(`/friends/requests/${id}/accept`, { method: 'POST' }));
  const refuse = (id: string) =>
    run(`refuse:${id}`, () => apiRequest(`/friends/requests/${id}/refuse`, { method: 'POST' }));
  const cancel = (id: string) =>
    run(`cancel:${id}`, () => apiRequest(`/friends/requests/${id}`, { method: 'DELETE' }));
  const remove = (userId: string) =>
    Alert.alert(t('friends.remove_title'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('relation.remove_friend'),
        style: 'destructive',
        onPress: () =>
          run(`remove:${userId}`, () => apiRequest(`/friends/${userId}`, { method: 'DELETE' })),
      },
    ]);

  const filteredFriends = friends.filter((f) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const TABS: { key: Sub; label: string; badge?: number }[] = [
    { key: 'friends', label: t('friends.my_friends') },
    { key: 'received', label: t('friends.received'), badge: received.length },
    { key: 'sent', label: t('friends.sent') },
  ];

  return (
    <View className="flex-1">
      {/* Sous-onglets */}
      <View className="flex-row px-4 gap-2 mb-1">
        {TABS.map((tab) => {
          const active = sub === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              className={`flex-row items-center px-3 py-1.5 rounded-full ${active ? 'bg-nexa' : 'bg-gray-100 dark:bg-zinc-800'}`}
              onPress={() => setSub(tab.key)}
            >
              <Text className={`text-base font-medium ${active ? 'text-white' : 'text-gray-600 dark:text-zinc-300'}`}>
                {tab.label}
              </Text>
              {tab.badge ? (
                <View className="ml-1.5 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                  <Text className="text-white text-[11px] font-bold">{tab.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {sub === 'friends' && (
        <View className="px-4 pt-2">
          <View className="flex-row items-center bg-gray-100 dark:bg-zinc-800 rounded-full px-4">
            <Ionicons name="search" size={16} color="#6B7280" />
            <TextInput
              className="flex-1 py-2 px-2 text-lg text-gray-900 dark:text-zinc-100"
              placeholder={t('friends.search_friends')}
              placeholderTextColor="#6B7280"
              value={query}
              onChangeText={setQuery}
            />
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#1E40AF" className="mt-10" />
      ) : sub === 'friends' ? (
        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={<Empty text={t('friends.no_friends')} />}
          renderItem={({ item }) => (
            <Row user={item} onPress={() => onOpenProfile(item.id)}>
              <TouchableOpacity
                onPress={() => remove(item.id)}
                className="p-1 items-center justify-center"
                style={{ width: 28, height: 28 }}
                disabled={!!busyId}
              >
                {busyId === `remove:${item.id}` ? (
                  <ActivityIndicator size="small" color="#9CA3AF" />
                ) : (
                  <Ionicons name="person-remove-outline" size={20} color="#9CA3AF" />
                )}
              </TouchableOpacity>
            </Row>
          )}
        />
      ) : sub === 'received' ? (
        <FlatList
          data={received}
          keyExtractor={(item) => item.requestId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={<Empty text={t('friends.no_received')} />}
          renderItem={({ item }) => (
            <Row
              user={item.user}
              subtitle={new Date(item.createdAt).toLocaleDateString()}
              onPress={() => onOpenProfile(item.user.id)}
            >
              <View className="flex-row gap-2">
                <ActionChip
                  label={t('relation.accept')}
                  onPress={() => accept(item.requestId)}
                  busy={busyId === `accept:${item.requestId}`}
                  disabled={!!busyId}
                  primary
                />
                <ActionChip
                  label={t('relation.refuse')}
                  onPress={() => refuse(item.requestId)}
                  busy={busyId === `refuse:${item.requestId}`}
                  disabled={!!busyId}
                />
              </View>
            </Row>
          )}
        />
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(item) => item.requestId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={<Empty text={t('friends.no_sent')} />}
          renderItem={({ item }) => (
            <Row user={item.user} onPress={() => onOpenProfile(item.user.id)}>
              <ActionChip
                label={t('relation.cancel_request')}
                onPress={() => cancel(item.requestId)}
                busy={busyId === `cancel:${item.requestId}`}
                disabled={!!busyId}
              />
            </Row>
          )}
        />
      )}
    </View>
  );
}

/**
 * Bouton d'action d'une ligne, avec son état d'attente.
 *
 * ⚠️ Le libellé reste RENDU pendant l'attente, simplement rendu invisible, et l'indicateur
 * se pose par-dessus en couche absolue. Le remplacer changerait la largeur du bouton, donc
 * la mise en page de la ligne — le même piège que les coches d'acheminement et le lecteur
 * vocal. Ici on ne peut même pas figer une largeur : elle dépend du libellé traduit.
 */
function ActionChip({
  label,
  onPress,
  busy,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      className={`rounded-full px-3 py-1.5 ${primary ? 'bg-nexa' : 'border border-gray-300 dark:border-zinc-700'}`}
      style={{ opacity: disabled && !busy ? 0.4 : 1 }}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        className={`text-sm font-semibold ${primary ? 'text-white' : 'text-gray-600 dark:text-zinc-300'}`}
        style={{ opacity: busy ? 0 : 1 }}
      >
        {label}
      </Text>
      {busy && (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <ActivityIndicator size="small" color={primary ? 'white' : '#6B7280'} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function Row({
  user,
  subtitle,
  onPress,
  children,
}: {
  user: Friend;
  subtitle?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-zinc-800"
      onPress={onPress}
    >
      <UserAvatar photoUrl={user.photoUrl} name={user.name} size={52} />
      <View className="flex-1 ml-3">
        <Text className="text-lg font-medium text-gray-900 dark:text-zinc-100">{user.name}</Text>
        {subtitle ? <Text className="text-gray-400 dark:text-zinc-500 text-sm">{subtitle}</Text> : null}
      </View>
      {children}
    </TouchableOpacity>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="items-center justify-center mt-20">
      <Text className="text-gray-400 dark:text-zinc-500">{text}</Text>
    </View>
  );
}
