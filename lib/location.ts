import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { apiRequest } from './api';

export type ProfileLocation = {
  city: string;
  country: string | null;
  updatedAt?: string | null;
};

/**
 * Résultat d'une tentative de relevé, à traduire côté écran.
 *
 * `canAskAgain: false` ⇒ iOS ne reproposera plus le dialogue : le seul recours est
 * d'ouvrir les réglages du système.
 */
export type LocateOutcome =
  | { ok: true; location: ProfileLocation }
  | { ok: false; reason: 'denied'; canAskAgain: boolean }
  | { ok: false; reason: 'unavailable' };

/**
 * Relève la position, la convertit en ville et l'enregistre au profil.
 *
 * ⚠️ Le géocodage inverse est fait **sur l'appareil** (`expo-location`), qui s'appuie sur
 * les services natifs d'iOS et d'Android : aucune clé Google Maps n'est nécessaire, et les
 * coordonnées ne quittent jamais le téléphone — seule la ville part au serveur.
 *
 * Relevé PONCTUEL, jamais un suivi : la position n'est lue que sur demande explicite.
 */
export const detectAndSaveCity = async (): Promise<LocateOutcome> => {
  let granted = false;
  let canAskAgain = true;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    granted = permission.status === 'granted';
    canAskAgain = permission.canAskAgain;
  } catch {
    // Module natif absent : l'app tourne sur un build antérieur à l'ajout d'expo-location.
    return { ok: false, reason: 'unavailable' };
  }
  if (!granted) return { ok: false, reason: 'denied', canAskAgain };

  try {
    // `Balanced` suffit largement pour une ville, et évite de solliciter le GPS.
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const [place] = await Location.reverseGeocodeAsync(position.coords);

    // Selon les pays, la ville remonte dans `city`, `subregion` ou `region`.
    const city = place?.city ?? place?.subregion ?? place?.region ?? null;
    if (!city) return { ok: false, reason: 'unavailable' };

    const saved = await apiRequest<ProfileLocation>('/users/me/location', {
      method: 'PATCH',
      body: { city, country: place?.country ?? null },
    });
    return { ok: true, location: saved };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
};

/** Retire la ville du profil (le réglage de confidentialité, lui, ne bouge pas). */
export const clearCity = () =>
  apiRequest('/users/me/location', { method: 'PATCH', body: { city: null } });

/**
 * Ouvre un point dans l'application de cartes du téléphone.
 *
 * Chaque plateforme a son schéma d'URL : Plans sur iOS, l'intent `geo:` sur Android — qui
 * laisse l'utilisateur choisir son application de cartes plutôt que d'imposer Google Maps.
 */
export const openInMaps = (latitude: number, longitude: number, label?: string | null) => {
  const name = encodeURIComponent(label || 'Position');
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${latitude},${longitude}&q=${name}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`;
  return Linking.openURL(url).catch(() => {});
};

export type MapApp = { key: string; label: string; url: string };

/**
 * Applications de navigation utilisables pour ce point.
 *
 * ⚠️ Sur iOS, `canOpenURL` ne répond `true` que pour les schémas déclarés dans
 * `LSApplicationQueriesSchemes` (app.json) : sans cette déclaration, une application
 * pourtant installée serait tenue pour absente.
 *
 * Le repli web est toujours proposé en dernier — il ouvre le navigateur, donc il marche
 * même quand aucune application de cartes n'est installée.
 */
export const availableMapApps = async (
  latitude: number,
  longitude: number,
  label?: string | null,
): Promise<MapApp[]> => {
  const name = encodeURIComponent(label || 'Position');
  const candidates: (MapApp & { probe?: string })[] = [
    Platform.OS === 'ios'
      ? {
          key: 'apple',
          label: 'Plans',
          url: `http://maps.apple.com/?ll=${latitude},${longitude}&q=${name}`,
        }
      : {
          // Android : `geo:` laisse le système présenter les applications de cartes.
          key: 'system',
          label: 'Cartes',
          url: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`,
        },
    {
      key: 'google',
      label: 'Google Maps',
      probe: 'comgooglemaps://',
      url: `comgooglemaps://?q=${latitude},${longitude}&center=${latitude},${longitude}`,
    },
    {
      key: 'waze',
      label: 'Waze',
      probe: 'waze://',
      url: `waze://?ll=${latitude},${longitude}&navigate=yes`,
    },
  ];

  const apps: MapApp[] = [];
  for (const { probe, ...app } of candidates) {
    if (!probe) {
      apps.push(app);
      continue;
    }
    const installed = await Linking.canOpenURL(probe).catch(() => false);
    if (installed) apps.push(app);
  }

  apps.push({
    key: 'web',
    label: 'Google Maps (web)',
    url: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });
  return apps;
};

export const openMapApp = (app: MapApp) => Linking.openURL(app.url).catch(() => {});

/** « Istanbul, Turquie » — ou la seule ville si le pays manque. */
export const formatLocation = (loc?: ProfileLocation | null) =>
  loc?.city ? [loc.city, loc.country].filter(Boolean).join(', ') : '';
