import { Image, Text, View } from 'react-native';

// Avatar circulaire réutilisable : photo de profil ou initiale sur fond vert nexa.
export function UserAvatar({
  photoUrl,
  name,
  size = 44,
}: {
  photoUrl?: string | null;
  name?: string;
  size?: number;
}) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="overflow-hidden bg-emerald-50 items-center justify-center"
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text className="text-nexa font-bold" style={{ fontSize: size * 0.4 }}>
          {(name?.[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}
