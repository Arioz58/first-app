import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SHEET_SPRING } from './BottomSheet';
import { UserAvatar } from './UserAvatar';

const NEXA = '#1E40AF';
const HANDLE_H = 76; // hauteur visible une fois replié : poignée + résumé
const ROW_H = 64;
const MAX_ROWS = 4; // au-delà, la liste défile plutôt que de manger la carte
// Au-delà de ce délai sans relevé, la position n'est plus tenue pour vivante : l'app de la
// personne est probablement passée en arrière-plan, où le suivi ne tourne pas encore.
const STALE_MS = 2 * 60 * 1000;

export type LivePerson = {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt?: string | null;
  user?: { id: string; name: string; photoUrl: string | null } | null;
};

/** « à l'instant » / « il y a 3 min » — la fraîcheur du dernier relevé. */
export const freshness = (updatedAt: string | null | undefined, t: (k: string, o?: any) => string) => {
  if (!updatedAt) return '';
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return t('live.just_now');
  if (minutes < 60) return t('live.minutes_ago', { count: minutes });
  return t('live.hours_ago', { count: Math.floor(minutes / 60) });
};

export const isStale = (updatedAt: string | null | undefined) =>
  !!updatedAt && Date.now() - new Date(updatedAt).getTime() > STALE_MS;

/**
 * Liste des personnes qui diffusent leur position, en tiroir sur la carte.
 *
 * Persistant et non modal : la liste doit rester consultable *pendant* qu'on regarde la
 * carte. Replié, il ne montre que la poignée et un résumé ; déployé, une ligne par
 * personne — c'est là que se lit la **fraîcheur** de chaque relevé, illisible sur des
 * marqueurs.
 */
export function LiveLocationDrawer({
  people,
  myExpiry,
  myLabel,
  currentUserId,
  onFocus,
  onStop,
}: {
  people: LivePerson[];
  myExpiry: number | null;
  myLabel: string;
  currentUserId: string | null;
  onFocus: (person: LivePerson) => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const rows = Math.min(people.length, MAX_ROWS);
  const expandedH = HANDLE_H + rows * ROW_H + (myExpiry ? ROW_H : 0) + 12;
  const hiddenH = Math.max(0, expandedH - HANDLE_H);

  // 0 = déployé, `hiddenH` = replié. Le tiroir s'ouvre déployé : on vient d'arriver sur la
  // carte pour savoir qui partage, autant le montrer d'emblée.
  const offset = useSharedValue(0);
  const start = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = offset.value;
    })
    .onUpdate((e) => {
      offset.value = Math.min(hiddenH, Math.max(0, start.value + e.translationY));
    })
    .onEnd((e) => {
      // La vélocité prime sur la position : un geste franc doit aboutir même à mi-course.
      const collapse = e.velocityY > 400 || (e.velocityY > -400 && offset.value > hiddenH / 2);
      offset.value = withSpring(collapse ? hiddenH : 0, SHEET_SPRING);
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[{ height: expandedH }, style]}
        className="absolute left-0 right-0 bottom-0 bg-white dark:bg-zinc-900 rounded-t-3xl px-4 pt-2"
      >
        <View className="items-center pb-2">
          <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700" />
        </View>

        <Text className="text-gray-400 dark:text-zinc-500 text-sm mb-1">
          {people.length
            ? t('live.people_count', { count: people.length })
            : t('live.empty_short')}
        </Text>

        {myExpiry ? (
          <View className="flex-row items-center" style={{ height: ROW_H }}>
            <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center">
              <Ionicons name="navigate" size={18} color={NEXA} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-gray-900 dark:text-zinc-100 font-semibold">
                {t('live.you')}
              </Text>
              <Text className="text-gray-400 dark:text-zinc-500 text-sm">{myLabel}</Text>
            </View>
            <TouchableOpacity className="bg-red-500 rounded-full px-4 py-2" onPress={onStop}>
              <Text className="text-white text-sm font-semibold">{t('live.stop')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {people
          .filter((p) => p.userId !== currentUserId)
          .map((person) => {
            const stale = isStale(person.updatedAt);
            return (
              <TouchableOpacity
                key={person.userId}
                className="flex-row items-center"
                style={{ height: ROW_H }}
                onPress={() => onFocus(person)}
                activeOpacity={0.7}
              >
                <UserAvatar
                  photoUrl={person.user?.photoUrl}
                  name={person.user?.name}
                  size={40}
                />
                <View className="flex-1 ml-3">
                  <Text
                    className="text-gray-900 dark:text-zinc-100 font-semibold"
                    numberOfLines={1}
                  >
                    {person.user?.name ?? ''}
                  </Text>
                  {/* Une position figée le dit : sans cette mention, un point immobile
                      passerait pour une personne immobile. */}
                  <Text
                    className={`text-sm ${stale ? 'text-amber-600 dark:text-amber-500' : 'text-gray-400 dark:text-zinc-500'}`}
                  >
                    {stale
                      ? t('live.stale', { time: freshness(person.updatedAt, t) })
                      : freshness(person.updatedAt, t)}
                  </Text>
                </View>
                <Ionicons name="locate" size={20} color={NEXA} />
              </TouchableOpacity>
            );
          })}
      </Animated.View>
    </GestureDetector>
  );
}
