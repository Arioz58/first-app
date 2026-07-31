import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import {
  DEFAULT_WALLPAPER_ASSET,
  resolveChatWallpaper,
  resolvePresetAsset,
  type ChatWallpaper,
} from '../lib/chatWallpapers';

// Voile posé entre le fond et les messages : le fond nexa est clair, les bulles reçues
// sont blanches — sans lui elles se détachent mal. Assez léger pour ne pas salir le
// fond ni les photos perso, juste de quoi asseoir les bulles dessus.
const VEIL_LIGHT = 'rgba(0,0,0,0.05)';
// En thème sombre les bulles (zinc-900) sont déjà foncées : le fond doit descendre un
// peu plus bas qu'elles pour qu'elles ressortent, d'où un voile plus marqué.
const VEIL_DARK = 'rgba(0,0,0,0.12)';

// Rend le fond personnel d'une conversation derrière la liste des messages :
// photo perso (expo-image, couvrante), dégradé (LinearGradient), couleur unie,
// ou — par défaut (aucun choix) — l'image nexa claire/sombre selon le thème.
export function ChatBackground({
  wallpaper,
  children,
}: {
  wallpaper: ChatWallpaper | null;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Le fond est toujours une couche absolue : le voile et les messages se posent
  // dessus de la même façon quelle que soit la nature du fond.
  let layer: ReactNode;
  if (wallpaper?.kind === 'photo') {
    layer = (
      <Image source={{ uri: wallpaper.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
    );
  } else {
    // Défaut (aucun choix) : asset nexa qui suit le thème de l'appareil.
    // Preset image explicite (nexa_light / nexa_dark) : variante forcée.
    const asset = wallpaper
      ? resolvePresetAsset(wallpaper.id)
      : DEFAULT_WALLPAPER_ASSET[isDark ? 'dark' : 'light'];
    const colors = resolveChatWallpaper(wallpaper?.id);

    if (asset) {
      layer = <Image source={asset} style={StyleSheet.absoluteFill} contentFit="cover" />;
    } else if (colors.length === 1) {
      layer = <View style={[StyleSheet.absoluteFill, { backgroundColor: colors[0] }]} />;
    } else {
      layer = (
        <LinearGradient
          colors={colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      );
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {layer}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? VEIL_DARK : VEIL_LIGHT }]}
      />
      {children}
    </View>
  );
}
