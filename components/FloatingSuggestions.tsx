import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from './UserAvatar';

export type Suggestion = {
  id: string;
  name: string;
  photoUrl: string | null;
  mutualFriendsCount: number;
};

const { width } = Dimensions.get('window');
const HEIGHT = 300;
const CENTER_X = width / 2;
const CENTER_Y = HEIGHT / 2;
const TAU = Math.PI * 2;

// Orbites : chaque bulle tourne autour du centre à son propre rayon, sa vitesse,
// son sens et sa phase de départ → nuée en mouvement façon écran iCloud.
type Orbit = { radius: number; size: number; phase: number; duration: number; dir: 1 | -1 };
const ORBITS: Orbit[] = [
  { radius: 62, size: 62, phase: 0.2, duration: 15500, dir: 1 },
  { radius: 96, size: 54, phase: 1.4, duration: 21000, dir: -1 },
  { radius: 116, size: 48, phase: 2.6, duration: 25000, dir: 1 },
  { radius: 78, size: 58, phase: 3.5, duration: 18000, dir: -1 },
  { radius: 108, size: 46, phase: 4.4, duration: 23000, dir: 1 },
  { radius: 92, size: 50, phase: 5.3, duration: 19500, dir: -1 },
  { radius: 70, size: 44, phase: 6.0, duration: 17000, dir: 1 },
];

// Anneaux concentriques de fond (contour seul), rayons croissants + opacité
// décroissante → effet « poupées russes » derrière la nuée.
const RINGS: { radius: number; opacity: number }[] = [
  { radius: 52, opacity: 0.14 },
  { radius: 84, opacity: 0.1 },
  { radius: 116, opacity: 0.07 },
  { radius: 146, opacity: 0.045 },
];

function Bubble({
  orbit,
  item,
  index,
  replayKey,
  onPress,
}: {
  orbit: Orbit;
  item: Suggestion;
  index: number;
  replayKey: number;
  onPress: () => void;
}) {
  const progress = useSharedValue(0);
  const appear = useSharedValue(0);

  useEffect(() => {
    // Rotation continue (linéaire, sans retour) : cos(2π)=cos(0) → aucune coupure.
    progress.value = withRepeat(
      withTiming(1, { duration: orbit.duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [orbit.duration, progress]);

  // Apparition en cascade avec léger rebond, rejouée à chaque arrivée sur l'onglet.
  useEffect(() => {
    appear.value = 0;
    appear.value = withDelay(index * 85, withSpring(1, { damping: 9, stiffness: 150, mass: 0.7 }));
  }, [replayKey, index, appear]);

  const style = useAnimatedStyle(() => {
    const angle = orbit.phase + progress.value * TAU * orbit.dir;
    return {
      opacity: appear.value,
      transform: [
        { translateX: orbit.radius * Math.cos(angle) },
        { translateY: orbit.radius * Math.sin(angle) },
        { scale: appear.value },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        // -2 = compense le liseré (padding 2) → orbite centrée pile sur le centre.
        { position: 'absolute', left: CENTER_X - orbit.size / 2 - 2, top: CENTER_Y - orbit.size / 2 - 2 },
        style,
      ]}
    >
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <View
          className="rounded-full bg-white dark:bg-zinc-900"
          style={{
            padding: 2,
            shadowColor: '#1E40AF',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          }}
        >
          <UserAvatar photoUrl={item.photoUrl} name={item.name} size={orbit.size} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Avatar central : pop d'apparition avec léger rebond.
function CenterAvatar({
  photoUrl,
  name,
  replayKey,
}: {
  photoUrl: string | null;
  name: string;
  replayKey: number;
}) {
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = 0;
    appear.value = withSpring(1, { damping: 10, stiffness: 150, mass: 0.7 });
  }, [replayKey, appear]);
  const style = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ scale: appear.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: CENTER_X - 47, top: CENTER_Y - 47 }, style]}>
      <View
        className="rounded-full bg-white dark:bg-zinc-900"
        style={{
          padding: 3,
          shadowColor: '#1E40AF',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <UserAvatar photoUrl={photoUrl} name={name} size={88} />
      </View>
    </Animated.View>
  );
}

// Anneau de fond : fondu + léger zoom, en cascade du centre vers l'extérieur.
function Ring({
  radius,
  opacity,
  index,
  replayKey,
}: {
  radius: number;
  opacity: number;
  index: number;
  replayKey: number;
}) {
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = 0;
    appear.value = withDelay(index * 70, withSpring(1, { damping: 12, stiffness: 120 }));
  }, [replayKey, index, appear]);
  const style = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: 0.85 + appear.value * 0.15 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: CENTER_X - radius,
          top: CENTER_Y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          borderWidth: 1.5,
          borderColor: `rgba(30,64,175,${opacity})`,
        },
        style,
      ]}
    />
  );
}

export default function FloatingSuggestions({
  suggestions,
  myPhotoUrl,
  myName,
  replayKey,
  onOpenProfile,
  onSeeAll,
}: {
  suggestions: Suggestion[];
  myPhotoUrl: string | null;
  myName: string;
  replayKey: number;
  onOpenProfile: (id: string) => void;
  onSeeAll: () => void;
}) {
  const { t } = useTranslation();
  if (suggestions.length === 0) return null;

  const shown = suggestions.slice(0, ORBITS.length);

  return (
    <View className="mt-4">
      <Text className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase px-5 pb-1">
        {t('activity.suggestions')}
      </Text>

      <View style={{ height: HEIGHT, width }}>
        {/* Anneaux concentriques de fond (fondu en cascade) */}
        {RINGS.map((ring, i) => (
          <Ring key={ring.radius} radius={ring.radius} opacity={ring.opacity} index={i} replayKey={replayKey} />
        ))}

        {/* Avatar central = moi */}
        <CenterAvatar photoUrl={myPhotoUrl} name={myName} replayKey={replayKey} />

        {shown.map((item, i) => (
          <Bubble
            key={item.id}
            orbit={ORBITS[i]}
            item={item}
            index={i}
            replayKey={replayKey}
            onPress={() => onOpenProfile(item.id)}
          />
        ))}
      </View>

      {/* Voir tout → drawer */}
      <TouchableOpacity className="items-center mt-1" onPress={onSeeAll}>
        <View className="flex-row items-center bg-blue-50 dark:bg-blue-950 rounded-full px-4 py-2">
          <Text className="text-nexa font-semibold text-sm">
            {t('activity.see_all', { count: suggestions.length })}
          </Text>
          <Ionicons name="chevron-forward" size={15} color="#1E40AF" style={{ marginLeft: 4 }} />
        </View>
      </TouchableOpacity>
    </View>
  );
}
