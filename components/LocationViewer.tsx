import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from './BottomSheet';
import { availableMapApps, openMapApp, type MapApp } from '../lib/location';
import { ROUND } from '../lib/radius';

const NEXA = '#1E40AF';
const ZOOM = 0.004;

/**
 * Position reçue, affichée **dans l'app**.
 *
 * Ouvrir directement une application de cartes ferait quitter la conversation pour un
 * simple coup d'œil. La carte est donc consultable ici, et le départ vers une application
 * de navigation devient un choix explicite — avec la possibilité de choisir laquelle.
 */
export function LocationViewer({
  visible,
  latitude,
  longitude,
  address,
  onClose,
}: {
  visible: boolean;
  latitude: number;
  longitude: number;
  address?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<MapApp[]>([]);
  const [chooser, setChooser] = useState(false);

  // Les applications installées sont cherchées à l'ouverture : la liste peut changer d'une
  // fois sur l'autre, et l'interroger coûte un aller-retour système par candidat.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    availableMapApps(latitude, longitude, address).then((list) => {
      if (!cancelled) setApps(list);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, latitude, longitude, address]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white dark:bg-zinc-900">
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: ZOOM,
            longitudeDelta: ZOOM,
          }}
          showsUserLocation
        >
          <Marker coordinate={{ latitude, longitude }} pinColor={NEXA} />
        </MapView>

        <TouchableOpacity
          onPress={onClose}
          className="absolute w-11 h-11 rounded-full bg-white dark:bg-zinc-800 items-center justify-center"
          style={{ top: insets.top + 8, left: 14, elevation: 5 }}
        >
          <Ionicons name="close" size={24} color={NEXA} />
        </TouchableOpacity>

        <View
          className="absolute left-0 right-0 bottom-0 bg-white dark:bg-zinc-900 rounded-t-3xl px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Text className="text-gray-900 dark:text-zinc-100 font-semibold" numberOfLines={2}>
            {address || t('location.shared')}
          </Text>
          <TouchableOpacity
            style={ROUND.bubble}
            className="bg-nexa py-4 items-center flex-row justify-center mt-3"
            onPress={() => setChooser(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text className="text-white font-semibold text-base ml-2">
              {t('location.open_with')}
            </Text>
          </TouchableOpacity>
        </View>

        <BottomSheet visible={chooser} onClose={() => setChooser(false)}>
          <View className="pb-6 pt-2">
            {apps.map((app) => (
              <TouchableOpacity
                key={app.key}
                className="flex-row items-center px-5 py-4"
                onPress={() => {
                  setChooser(false);
                  openMapApp(app);
                }}
              >
                <Ionicons name="map-outline" size={22} color={NEXA} />
                <Text className="ml-4 text-gray-900 dark:text-zinc-100 text-base">
                  {app.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </BottomSheet>
      </View>
    </Modal>
  );
}
