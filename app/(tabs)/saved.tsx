import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { startCall } from '../../lib/callEngine';
import {
  callIcon,
  callLabel,
  formatDuration,
  formatListDate,
  groupCalls,
  MISSED_COLOR,
  type CallGroup,
  type CallItem,
} from '../../lib/callHistory';
import { useThemeColors } from '../../lib/theme';

/**
 * Onglet « Appels » — l'historique.
 *
 * ⚠️ La route s'appelle toujours `saved`, comme l'onglet « Contacts » s'appelle `search` :
 * renommer le fichier casserait le `NativeTabs.Trigger` et toutes les navigations qui le
 * visent. Seul le libellé compte pour l'utilisateur.
 */

const NEXA = '#1E40AF';

export default function CallsScreen() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const router = useRouter();
  const [calls, setCalls] = useState<CallItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Filtre Tous / Manqués, comme l'app Téléphone. Purement local : la liste complète est
   * déjà chargée, et « manqué » est calculé par le serveur.
   */
  const [filter, setFilter] = useState<'all' | 'missed'>('all');

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

  /** Le (i) : la fiche d'appel façon iPhone — historique avec la personne + actions. */
  const openInfo = (item: CallItem) =>
    router.push({
      pathname: '/calls/[id]' as any,
      // Nom et photo passés pour afficher l'en-tête sans attendre le réseau.
      params: { id: item.peer.id, name: item.peer.name, photo: item.peer.photoUrl ?? '' },
    });

  const renderItem = ({ item: group }: { item: CallGroup }) => {
    const item = group.latest;
    return (
      <TouchableOpacity
        onPress={() => rappeler(item)}
        className="flex-row items-center pl-4 pr-2 py-3"
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
              color: item.missed ? MISSED_COLOR : c.content,
              fontSize: 17,
              fontWeight: '600',
            }}
          >
            {item.peer.name}
            {/* Plusieurs appels d'affilée : le compte, comme « Alice (3) » sur l'app Téléphone. */}
            {group.count > 1 ? ` (${group.count})` : ''}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Ionicons name={callIcon(item)} size={14} color={item.missed ? MISSED_COLOR : c.muted} />
            <Text numberOfLines={1} style={{ color: c.muted, fontSize: 14, marginLeft: 4, flexShrink: 1 }}>
              {callLabel(item, t)}
              {/* La durée n'a de sens que pour un appel seul : sur un groupe, elle ne dirait
                  que celle du dernier, ce qui se lirait comme un total. */}
              {item.duration && group.count === 1 ? ` · ${formatDuration(item.duration)}` : ''}
            </Text>
          </View>
        </View>
        <Text style={{ color: c.muted, fontSize: 14, marginLeft: 8 }}>{formatListDate(item.createdAt, t)}</Text>
        {/*
          ⚠️ Zone tactile PROPRE au (i), élargie par `hitSlop` : c'est une petite cible posée
          sur une ligne qui, elle, rappelle. Un appui un peu à côté ne doit pas lancer un appel
          à la place d'ouvrir la fiche.
        */}
        <TouchableOpacity
          onPress={() => openInfo(item)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('calls.info')}
          className="p-2 ml-1"
        >
          <Ionicons name="information-circle-outline" size={26} color={c.nexa} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const visible = calls === null ? null : filter === 'missed' ? calls.filter((x) => x.missed) : calls;
  const groups = visible ? groupCalls(visible) : [];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.canvas }} edges={['top']}>
      <Text className="text-4xl font-bold text-nexa px-4 pt-2 pb-1">{t('tabs.calls')}</Text>
      {calls !== null && calls.length > 0 && (
        <>
          <View className="flex-row px-4 pt-2 pb-1">
            {(['all', 'missed'] as const).map((f) => {
              const active = filter === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  // Même puce que les filtres de l'onglet Discussion.
                  className={`rounded-full px-4 py-2 mr-2 ${active ? 'bg-nexa' : 'bg-gray-100 dark:bg-zinc-800'}`}
                >
                  <Text
                    className={`text-base font-semibold ${active ? 'text-white' : 'text-gray-600 dark:text-zinc-300'}`}
                  >
                    {t(`calls.filter_${f}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Demande du client (24/09) : « Récents » en gras en haut à gauche, comme l'app Téléphone. */}
          <Text className="text-xl font-bold px-4 pt-3 pb-2" style={{ color: c.content }}>
            {t('calls.recents')}
          </Text>
        </>
      )}

      {calls === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={NEXA} />
        </View>
      ) : groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="call-outline" size={46} color={c.faint} />
          <Text style={{ color: c.muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
            {calls.length === 0 ? t('calls.empty') : t('calls.empty_missed')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.key}
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
