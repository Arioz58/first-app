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

  if (wallpaper?.kind === 'photo') {
    return (
      <View style={{ flex: 1 }}>
        <Image
          source={{ uri: wallpaper.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        {children}
      </View>
    );
  }

  // Défaut (aucun choix) : asset nexa qui suit le thème de l'appareil.
  // Preset image explicite (nexa_light / nexa_dark) : variante forcée.
  const asset = wallpaper
    ? resolvePresetAsset(wallpaper.id)
    : DEFAULT_WALLPAPER_ASSET[scheme === 'dark' ? 'dark' : 'light'];
  if (asset) {
    return (
      <View style={{ flex: 1 }}>
        <Image source={asset} style={StyleSheet.absoluteFill} contentFit="cover" />
        {children}
      </View>
    );
  }

  const colors = resolveChatWallpaper(wallpaper?.id);

  if (colors.length === 1) {
    return <View style={{ flex: 1, backgroundColor: colors[0] }}>{children}</View>;
  }

  return (
    <LinearGradient
      colors={colors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      {children}
    </LinearGradient>
  );
}
