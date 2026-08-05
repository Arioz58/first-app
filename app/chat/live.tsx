import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAvatar } from '../../components/UserAvatar';
import { LiveLocationDrawer, isStale } from '../../components/LiveLocationDrawer';
import { apiRequest } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { getUserId } from '../../lib/storage';
import { remainingLabel, stopLiveShare, useMyLiveShare } from '../../lib/liveLocation';

const NEXA = '#1E40AF';

type LiveEntry = {
  userId: string;
  latitude: number;
  longitude: number;
  expiresAt: string;
  updatedAt?: string | null; // date du relevé → fraîcheur affichée
  user?: { id: string; name: string; photoUrl: string | null };
};

/**
 * Carte des positions partagées dans une conversation.
 *
 * L'état initial vient du serveur (`GET /conversations/:id/live-locations`) et les relevés
 * suivants arrivent par socket : rejoindre la carte en cours de route montre donc tout de
 * suite où en sont les autres, sans attendre leur prochain déplacement.
 */
export default function LiveLocationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [entries, setEntries] = useState<Record<string, LiveEntry>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Fait vieillir les libellés « il y a N min » sans attendre un nouveau relevé — c'est
  // justement quand plus rien n'arrive que la fraîcheur doit se voir.
  const [, setTick] = useState(0);
  const mapRef = useRef<MapView>(null);
  const framedRef = useRef(false); // le cadrage automatique ne joue qu'une fois
  const myExpiry = useMyLiveShare(id);

  useEffect(() => {
    getUserId().then(setCurrentUserId);
    const clock = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiRequest<LiveEntry[]>(`/conversations/${id}/live-locations`)
      .then((list) => {
        if (cancelled) return;
        setEntries(Object.fromEntries(list.map((e) => [e.userId, e])));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    const socket = getSocket();
    socket?.on('live_location', (e: LiveEntry & { conversationId: string }) => {
      if (e.conversationId !== id) return;
      setEntries((prev) => ({ ...prev, [e.userId]: { ...prev[e.userId], ...e } }));
    });
    socket?.on(
      'live_location_ended',
      (e: { conversationId: string; userId: string }) => {
        if (e.conversationId !== id) return;
        setEntries((prev) => {
          const next = { ...prev };
          delete next[e.userId];
          return next;
        });
      },
    );

    return () => {
      cancelled = true;
      socket?.off('live_location');
      socket?.off('live_location_ended');
    };
  }, [id]);

  const list = Object.values(entries);

  // Premier cadrage : englober tout le monde. Ensuite on laisse la carte tranquille — la
  // recadrer à chaque relevé arracherait la vue des mains de l'utilisateur.
  useEffect(() => {
    if (framedRef.current || !list.length || !mapRef.current) return;
    framedRef.current = true;
    mapRef.current.fitToCoordinates(
      list.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
      { edgePadding: { top: 120, right: 80, bottom: 200, left: 80 }, animated: false },
    );
  }, [list]);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity onPress={() => router.back()} className="pr-3 py-1">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-nexa" numberOfLines={1}>
            {t('live.title')}
          </Text>
          {name ? (
            <Text className="text-gray-400 dark:text-zinc-500 text-sm" numberOfLines={1}>
              {name}
            </Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-16" color={NEXA} />
      ) : !list.length ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="navigate-outline" size={44} color="#D1D5DB" />
          <Text className="text-gray-400 dark:text-zinc-500 text-center mt-3">
            {t('live.empty')}
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <MapView ref={mapRef} style={{ flex: 1 }} showsUserLocation>
            {list.map((e) => (
              <Marker
                key={e.userId}
                coordinate={{ latitude: e.latitude, longitude: e.longitude }}
                title={e.user?.name}
              >
                {/* Avatar plutôt qu'une épingle : sur une carte à plusieurs, savoir QUI
                    est où compte davantage que la précision du point. Grisé quand le
                    relevé n'est plus frais, pour ne pas faire passer une position figée
                    pour une position vivante. */}
                <View
                  className={`rounded-full border-2 ${isStale(e.updatedAt) ? 'border-amber-400 opacity-60' : 'border-white'}`}
                  style={{ elevation: 4 }}
                >
                  <UserAvatar photoUrl={e.user?.photoUrl} name={e.user?.name} size={40} />
                </View>
              </Marker>
            ))}
          </MapView>

          <LiveLocationDrawer
            people={list}
            myExpiry={myExpiry}
            myLabel={myExpiry ? t('live.sharing_for', { time: remainingLabel(myExpiry) }) : ''}
            currentUserId={currentUserId}
            onStop={() => stopLiveShare(id)}
            onFocus={(person) =>
              mapRef.current?.animateToRegion(
                {
                  latitude: person.latitude,
                  longitude: person.longitude,
                  latitudeDelta: 0.004,
                  longitudeDelta: 0.004,
                },
                400,
              )
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}
