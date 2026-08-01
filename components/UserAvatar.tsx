import { Ionicons } from '@expo/vector-icons';
import { Image, Text, View } from 'react-native';

const NEXA = '#1E40AF';

// Avatar circulaire réutilisable : photo de profil ou, à défaut, initiale sur fond bleu
// nexa — deux silhouettes pour un groupe (`group`), dont l'initiale ne dirait rien.
// ⚠️ Ces deux replis sont redessinés à l'identique dans l'extension de notification iOS
// (`targets/notification`) : les changer ici demande de les y reporter.
export function UserAvatar({
  photoUrl,
  name,
  size = 52,
  group = false,
}: {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  group?: boolean;
}) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="overflow-hidden bg-blue-50 dark:bg-blue-950 items-center justify-center"
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} />
      ) : group ? (
        <Ionicons name="people" size={size * 0.46} color={NEXA} />
      ) : (
        <Text className="text-nexa font-bold" style={{ fontSize: size * 0.4 }}>
          {(name?.[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}
