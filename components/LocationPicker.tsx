import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';
import { ProgressiveBlur } from './ProgressiveBlur';

const NEXA = '#1E40AF';
// Fenêtre d'environ 500 m de côté : assez serré pour situer une rue, assez large pour se
// repérer d'un coup d'œil.
const ZOOM = 0.005;
const PIN_SIZE = 40;
// Remontée du repère pour que sa POINTE tombe sur le centre de la carte. Une marge égale
// à la hauteur de l'icône serait la valeur théorique, mais le glyphe ne touche pas le bas
// de sa boîte : ces quelques pixels de rattrapage viennent de l'écran, pas du calcul.
const PIN_LIFT = PIN_SIZE + 12;

export type PickedLocation = { latitude: number; longitude: number; address: string };

/**
 * Choix d'un point à envoyer dans une conversation.
 *
 * La carte s'ouvre sur la position de l'utilisateur ; il peut la déplacer pour désigner un
 * autre endroit — le repère reste au centre, c'est la carte qui bouge sous lui, ce qui
 * évite d'avoir à viser un marqueur au doigt.
 */
export function LocationPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (location: PickedLocation) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState<Region | null>(null);
  const [address, setAddress] = useState('');
  const [denied, setDenied] = useState(false);
  // Le centre courant, tenu dans un ref : il change à chaque image du déplacement et n'a
  // pas à provoquer de rendu.
  const centerRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const addressReq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          if (!cancelled) setDenied(true);
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: ZOOM,
          longitudeDelta: ZOOM,
        };
        centerRef.current = next;
        setRegion(next);
        describe(next);
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  /** Adresse lisible du point visé — indicative, l'envoi n'en dépend pas. */
  const describe = async (point: { latitude: number; longitude: number }) => {
    const req = ++addressReq.current;
    try {
      const [place] = await Location.reverseGeocodeAsync(point);
      // Une réponse plus ancienne peut arriver après une plus récente : on l'ignore.
      if (req !== addressReq.current) return;
      const line = [place?.street, place?.city ?? place?.subregion, place?.country]
        .filter(Boolean)
        .join(', ');
      setAddress(line);
    } catch {
      if (req === addressReq.current) setAddress('');
    }
  };

  const send = () => {
    const point = centerRef.current;
    if (!point) return;
    onPick({ ...point, address });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white dark:bg-zinc-900">
        <View
          className="flex-row items-center px-4 pb-3 bg-white dark:bg-zinc-900"
          style={{ paddingTop: insets.top + 8 }}
        >
          <TouchableOpacity onPress={onClose} className="pr-3 py-1">
            <Ionicons name="close" size={26} color={NEXA} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-nexa">{t('location.send_title')}</Text>
        </View>

        {denied ? (
          <View className="flex-1 items-center justify-center px-10">
            <Ionicons name="location-outline" size={44} color="#D1D5DB" />
            <Text className="text-gray-500 dark:text-zinc-400 text-center mt-3">
              {t('location.denied')}
            </Text>
          </View>
        ) : !region ? (
          <ActivityIndicator className="mt-16" color={NEXA} />
        ) : (
          <View className="flex-1">
            {/* ⚠️ Le repère doit se superposer à la CARTE SEULE. Posé sur le conteneur
                entier, il se retrouvait centré sur « carte + panneau du bas », donc plus
                bas que le point réellement visé — le pin désignait un endroit, l'envoi en
                enregistrait un autre. */}
            <View className="flex-1">
              <MapView
                style={StyleSheet.absoluteFill}
                initialRegion={region}
                showsUserLocation
                onRegionChangeComplete={(next) => {
                  centerRef.current = { latitude: next.latitude, longitude: next.longitude };
                  describe(next);
                }}
              />
              <View
                style={StyleSheet.absoluteFill}
                className="items-center justify-center"
                pointerEvents="none"
              >
                <Ionicons
                  name="location"
                  size={PIN_SIZE}
                  color={NEXA}
                  style={{ marginBottom: PIN_LIFT }}
                />
              </View>
            </View>

            <View
              className="px-5 pt-4 bg-white dark:bg-zinc-900"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <Text
                className="text-gray-500 dark:text-zinc-400 mb-3"
                numberOfLines={2}
              >
                {address || t('location.pin_hint')}
              </Text>
              <TouchableOpacity
                style={ROUND.bubble}
                className="bg-nexa py-4 items-center"
                onPress={send}
                activeOpacity={0.85}
              >
                <Text className="text-white font-semibold text-base">
                  {t('location.send_action')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const BUBBLE_W = 244;
const BUBBLE_H = 186;
// Bande d'information en bas de l'aperçu. Le flou y monte progressivement : la carte reste
// nette au-dessus et se dissout sous le texte, plutôt que d'être coupée par un bandeau.
// ⚠️ Une montée progressive a besoin de hauteur. Sur une bande courte, le texte se pose sur
// une zone encore presque nette et devient illisible dès que la carte est chargée — c'est
// ce qui poussait à écraser le dégradé en quelques pixels, d'où son allure de bandeau.
const INFO_H = 116;
// Le repère se retrouverait sinon dans le bas de la bande, donc flouté : on décale la carte
// vers le sud pour qu'il remonte dans la partie nette. Exprimé en fraction de la hauteur.
const PIN_RISE = 0.16;

/** Aperçu figé d'une position, tel qu'il apparaît dans une bulle. */
export function LocationBubble({
  latitude,
  longitude,
  address,
  onPress,
}: {
  latitude: number;
  longitude: number;
  address?: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={ROUND.bubble} className="overflow-hidden">
      <View style={{ width: BUBBLE_W, height: BUBBLE_H }}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: latitude - PIN_RISE * ZOOM,
            longitude,
            latitudeDelta: ZOOM,
            longitudeDelta: ZOOM,
          }}
          // Carte d'illustration : tout geste appartient à la bulle, pas à la carte.
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          pointerEvents="none"
        >
          <Marker coordinate={{ latitude, longitude }} pinColor={NEXA} />
        </MapView>

        {/* Même dégradé que le haut du fil de discussion, retourné : net en haut, flou en
            bas. Le texte se pose dessus sans qu'aucune bande opaque ne rogne la carte. */}
        <ProgressiveBlur
          edge="bottom"
          height={INFO_H}
          intensity={95}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        />

        <View
          className="absolute left-0 right-0 bottom-0 px-3 pb-2.5 justify-end"
          style={{ height: INFO_H }}
          pointerEvents="none"
        >
          <Text className="text-gray-900 dark:text-zinc-100 font-semibold" numberOfLines={2}>
            {address || t('location.shared')}
          </Text>
          {/* ⚠️ Pas de bleu nexa ici : à cette taille, sur une carte floutée dont le fond
              n'est ni clair ni sombre, il ne se détache pas assez. On reprend la couleur du
              texte principal, qui suit le thème. */}
          <View className="flex-row items-center mt-0.5">
            <Ionicons name="open-outline" size={13} color={colors.content} />
            <Text className="text-gray-900 dark:text-zinc-100 text-sm ml-1">
              {t('location.open_maps')}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
