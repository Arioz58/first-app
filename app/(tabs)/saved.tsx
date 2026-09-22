import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { startCall } from '../../lib/callEngine';
import { useThemeColors } from '../../lib/theme';

/**
 * Onglet « Appels » — l'historique.
 *
 * ⚠️ La route s'appelle toujours `saved`, comme l'onglet « Contacts » s'appelle `search` :
 * renommer le fichier casserait le `NativeTabs.Trigger` et toutes les navigations qui le
 * visent. Seul le libellé compte pour l'utilisateur.
 */

const NEXA = '#1E40AF';
const MISSED = '#DC2626';

type CallItem = {
  id: string;
  type: string;
  status: string;
  duration: number | null;
  createdAt: string;
  /** Le sens et le « manqué » sont calculés PAR LE SERVEUR, qui seul connaît les deux bouts. */
  outgoing: boolean;
  missed: boolean;
  peer: { id: string; name: string; photoUrl: string | null };
};

/** « 2:05 » — un appel se lit en minutes, jamais en secondes brutes. */
const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

export default function CallsScreen() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const [calls, setCalls] = useState<CallItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCalls(await apiRequest<CallItem[]>('/calls'));
    } catch {
      // ⚠️ `[]` et non `null` : sans cela l'écran resterait sur son indicateur de
      // chargement indéfiniment, et rien ne dirait que quelque chose a échoué.
      setCalls([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const rappeler = async (item: CallItem) => {
    const r = await startCall({ id: item.peer.id, name: item.peer.name, photoUrl: item.peer.photoUrl });
    if (r.ok) return;
    Alert.alert(
      '',
      r.reason === 'busy'
        ? t('calls.peer_busy')
        : r.reason === 'refused'
          ? t('details.call_unavailable')
          : t('calls.failed'),
    );
  };

  const renderItem = ({ item }: { item: CallItem }) => {
    const date = new Date(item.createdAt);
    const aujourdhui = new Date().toDateString() === date.toDateString();
    const quand = aujourdhui
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

    return (
      <TouchableOpacity
        onPress={() => rappeler(item)}
        className="flex-row items-center px-4 py-3"
        style={{ backgroundColor: c.canvas }}
      >
        <UserAvatar name={item.peer.name} photoUrl={item.peer.photoUrl} size={48} />
        <View className="flex-1 ml-3">
          <Text
            numberOfLines={1}
            style={{
              // ⚠️ Le rouge ne marque QUE les appels manqués, et seulement chez celui qui
              // n'a pas décroché : pour l'appelant, un appel sans réponse n'est pas un
              // appel manqué. C'est le serveur qui tranche.
              color: item.missed ? MISSED : c.content,
              fontSize: 17,
              fontWeight: '600',
            }}
          >
            {item.peer.name}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Ionicons
              name={item.outgoing ? 'arrow-up-outline' : 'arrow-down-outline'}
              size={14}
              color={item.missed ? MISSED : c.muted}
            />
            <Text style={{ color: c.muted, fontSize: 14, marginLeft: 4 }}>
              {item.missed
                ? t('calls.missed')
                : item.duration
                  ? formatDuration(item.duration)
                  : t('calls.no_answer')}
              {' · '}
              {quand}
            </Text>
          </View>
        </View>
        <Ionicons name="call-outline" size={22} color={NEXA} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.canvas }} edges={['top']}>
      <Text className="text-4xl font-bold text-nexa px-4 pt-2 pb-3">{t('tabs.calls')}</Text>

      {calls === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={NEXA} />
        </View>
      ) : calls.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="call-outline" size={46} color={c.faint} />
          <Text style={{ color: c.muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
            {t('calls.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, marginLeft: 76, backgroundColor: c.line }} />
          )}
          // La tab bar native flotte au-dessus du contenu : sans cette marge, le dernier
          // appel se retrouve dessous.
          contentContainerStyle={{ paddingBottom: 96 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={NEXA}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
