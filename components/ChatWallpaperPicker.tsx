import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CHAT_WALLPAPERS,
  DEFAULT_WALLPAPER_ASSET,
  type ChatWallpaper,
} from '../lib/chatWallpapers';
import BottomSheet from './BottomSheet';

type Props = {
  visible: boolean;
  current: ChatWallpaper | null;
  onClose: () => void;
  onSelect: (wallpaper: ChatWallpaper | null) => void;
};

const SWATCH = 'w-[68px] h-[68px] rounded-2xl overflow-hidden items-center justify-center';

// Pastille de sélection (coche verte en surimpression).
function Check() {
  return (
    <View className="absolute inset-0 items-center justify-center bg-black/15">
      <View className="w-7 h-7 rounded-full bg-nexa items-center justify-center">
        <Ionicons name="checkmark" size={18} color="white" />
      </View>
    </View>
  );
}

export default function ChatWallpaperPicker({ visible, current, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const [busy, setBusy] = useState(false);

  const isPreset = (id: string) => current?.kind === 'preset' && current.id === id;
  const isPhoto = current?.kind === 'photo';

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('chat.wallpaper'), t('chat.wallpaper_permission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;

    setBusy(true);
    try {
      const src = result.assets[0].uri;
      const ext = (src.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase();
      // Copie dans le stockage permanent (l'uri du picker vit en cache → purgeable).
      const dest = `${FileSystem.documentDirectory}wallpaper_${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: src, to: dest });
      onSelect({ kind: 'photo', uri: dest });
    } catch {
      Alert.alert(t('chat.wallpaper'), t('chat.wallpaper_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} backdropOpacity={0.12}>
      <View className="px-5 pb-10 pt-1">
        <Text className="text-lg font-bold text-gray-900">{t('chat.wallpaper')}</Text>
        <Text className="text-sm text-gray-500 mt-1 mb-4">{t('chat.wallpaper_hint')}</Text>

        <View className="flex-row flex-wrap gap-3">
          {/* Défaut (asset nexa selon le thème) */}
          <TouchableOpacity onPress={() => onSelect(null)} className="items-center" activeOpacity={0.8}>
            <View className={`${SWATCH} border border-gray-200`}>
              <Image
                source={DEFAULT_WALLPAPER_ASSET[scheme === 'dark' ? 'dark' : 'light']}
                style={{ width: 68, height: 68 }}
                contentFit="cover"
              />
              {!current && <Check />}
            </View>
            <Text className="text-[11px] text-gray-500 mt-1">{t('chat.wallpaper_auto')}</Text>
          </TouchableOpacity>

          {/* Presets (image nexa clair/sombre, puis couleurs/dégradés) */}
          {CHAT_WALLPAPERS.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => onSelect({ kind: 'preset', id: w.id })}
              activeOpacity={0.8}
            >
              {w.asset ? (
                <View className={`${SWATCH} border border-gray-200`}>
                  <Image source={w.asset} style={{ width: 68, height: 68 }} contentFit="cover" />
                  {isPreset(w.id) && <Check />}
                </View>
              ) : w.colors!.length === 1 ? (
                <View className={SWATCH} style={{ backgroundColor: w.colors![0] }}>
                  {isPreset(w.id) && <Check />}
                </View>
              ) : (
                <LinearGradient
                  colors={w.colors as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 16, width: 68, height: 68 }}
                >
                  {isPreset(w.id) && <Check />}
                </LinearGradient>
              )}
            </TouchableOpacity>
          ))}

          {/* Photo depuis la galerie */}
          <TouchableOpacity onPress={pickPhoto} className="items-center" activeOpacity={0.8}>
            {isPhoto ? (
              <View className={SWATCH}>
                <Image source={{ uri: current.uri }} style={{ width: 68, height: 68 }} contentFit="cover" />
                <Check />
              </View>
            ) : (
              <View className={`${SWATCH} bg-gray-100 border border-dashed border-gray-300`}>
                <Ionicons name="image-outline" size={26} color="#128C7E" />
              </View>
            )}
            <Text className="text-[11px] text-gray-500 mt-1">{t('chat.wallpaper_gallery')}</Text>
          </TouchableOpacity>
        </View>

        {busy && <ActivityIndicator className="mt-5" color="#128C7E" />}
      </View>
    </BottomSheet>
  );
}
