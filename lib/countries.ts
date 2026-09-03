import { getLocales } from 'expo-localization';

/** Marché principal de la V1 : ce sur quoi on retombe quand la région est inconnue. */
const FALLBACK_REGION = 'TR';

export type Country = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  example?: string; // exemple de format national (placeholder du champ numéro)
};

export const COUNTRIES: Country[] = [
  { code: 'TR', name: 'Türkiye', dialCode: '+90', flag: '🇹🇷', example: '5XX XXX XX XX' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', example: '6 12 34 56 78' },
  { code: 'DZ', name: 'Algérie', dialCode: '+213', flag: '🇩🇿' },
  { code: 'DE', name: 'Allemagne', dialCode: '+49', flag: '🇩🇪' },
  { code: 'SA', name: 'Arabie Saoudite', dialCode: '+966', flag: '🇸🇦' },
  { code: 'AM', name: 'Arménie', dialCode: '+374', flag: '🇦🇲' },
  { code: 'AU', name: 'Australie', dialCode: '+61', flag: '🇦🇺' },
  { code: 'AT', name: 'Autriche', dialCode: '+43', flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaïdjan', dialCode: '+994', flag: '🇦🇿' },
  { code: 'BE', name: 'Belgique', dialCode: '+32', flag: '🇧🇪' },
  { code: 'BR', name: 'Brésil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'BG', name: 'Bulgarie', dialCode: '+359', flag: '🇧🇬' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'CN', name: 'Chine', dialCode: '+86', flag: '🇨🇳' },
  { code: 'KR', name: 'Corée du Sud', dialCode: '+82', flag: '🇰🇷' },
  { code: 'HR', name: 'Croatie', dialCode: '+385', flag: '🇭🇷' },
  { code: 'DK', name: 'Danemark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'EG', name: 'Égypte', dialCode: '+20', flag: '🇪🇬' },
  { code: 'AE', name: 'Émirats Arabes Unis', dialCode: '+971', flag: '🇦🇪' },
  { code: 'ES', name: 'Espagne', dialCode: '+34', flag: '🇪🇸' },
  { code: 'US', name: 'États-Unis', dialCode: '+1', flag: '🇺🇸' },
  { code: 'FI', name: 'Finlande', dialCode: '+358', flag: '🇫🇮' },
  { code: 'GE', name: 'Géorgie', dialCode: '+995', flag: '🇬🇪' },
  { code: 'GR', name: 'Grèce', dialCode: '+30', flag: '🇬🇷' },
  { code: 'HU', name: 'Hongrie', dialCode: '+36', flag: '🇭🇺' },
  { code: 'IN', name: 'Inde', dialCode: '+91', flag: '🇮🇳' },
  { code: 'IQ', name: 'Irak', dialCode: '+964', flag: '🇮🇶' },
  { code: 'IR', name: 'Iran', dialCode: '+98', flag: '🇮🇷' },
  { code: 'IE', name: 'Irlande', dialCode: '+353', flag: '🇮🇪' },
  { code: 'IL', name: 'Israël', dialCode: '+972', flag: '🇮🇱' },
  { code: 'IT', name: 'Italie', dialCode: '+39', flag: '🇮🇹' },
  { code: 'JP', name: 'Japon', dialCode: '+81', flag: '🇯🇵' },
  { code: 'JO', name: 'Jordanie', dialCode: '+962', flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿' },
  { code: 'KW', name: 'Koweït', dialCode: '+965', flag: '🇰🇼' },
  { code: 'LB', name: 'Liban', dialCode: '+961', flag: '🇱🇧' },
  { code: 'LU', name: 'Luxembourg', dialCode: '+352', flag: '🇱🇺' },
  { code: 'MA', name: 'Maroc', dialCode: '+212', flag: '🇲🇦' },
  { code: 'MX', name: 'Mexique', dialCode: '+52', flag: '🇲🇽' },
  { code: 'NO', name: 'Norvège', dialCode: '+47', flag: '🇳🇴' },
  { code: 'NL', name: 'Pays-Bas', dialCode: '+31', flag: '🇳🇱' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { code: 'PL', name: 'Pologne', dialCode: '+48', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦' },
  { code: 'RO', name: 'Roumanie', dialCode: '+40', flag: '🇷🇴' },
  { code: 'GB', name: 'Royaume-Uni', dialCode: '+44', flag: '🇬🇧' },
  { code: 'RU', name: 'Russie', dialCode: '+7', flag: '🇷🇺' },
  { code: 'SN', name: 'Sénégal', dialCode: '+221', flag: '🇸🇳' },
  { code: 'RS', name: 'Serbie', dialCode: '+381', flag: '🇷🇸' },
  { code: 'SG', name: 'Singapour', dialCode: '+65', flag: '🇸🇬' },
  { code: 'SO', name: 'Somalie', dialCode: '+252', flag: '🇸🇴' },
  { code: 'SE', name: 'Suède', dialCode: '+46', flag: '🇸🇪' },
  { code: 'CH', name: 'Suisse', dialCode: '+41', flag: '🇨🇭' },
  { code: 'SY', name: 'Syrie', dialCode: '+963', flag: '🇸🇾' },
  { code: 'TN', name: 'Tunisie', dialCode: '+216', flag: '🇹🇳' },
  { code: 'TM', name: 'Turkménistan', dialCode: '+993', flag: '🇹🇲' },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },
  { code: 'UZ', name: 'Ouzbékistan', dialCode: '+998', flag: '🇺🇿' },
  { code: 'YE', name: 'Yémen', dialCode: '+967', flag: '🇾🇪' },
];

/**
 * Région de l'appareil (« FR », « TR »…), telle que déclarée par ses réglages.
 *
 * ⚠️ `expo-localization` et non la géolocalisation : c'est instantané, hors ligne, et surtout
 * SANS PERMISSION. Demander l'accès à la position pour pré-remplir un indicatif serait
 * disproportionné, et le refus — fréquent sur un premier écran — laisserait de toute façon
 * sans réponse.
 *
 * ⚠️ C'est la région des RÉGLAGES, pas celle où l'on se trouve : un Français en voyage garde
 * « FR », ce qui est justement le bon indicatif pour SON numéro. Une détection par position
 * lui proposerait le pays où il passe ses vacances.
 */
export const deviceRegion = (): string => {
  const r = getLocales()[0]?.regionCode;
  return r && r.length === 2 ? r.toUpperCase() : FALLBACK_REGION;
};

/**
 * Pays pré-sélectionné à la saisie d'un numéro.
 *
 * ⚠️ Repli sur la Turquie : c'est le marché de la V1, et la liste `COUNTRIES` ne couvre pas
 * le monde entier — un appareil réglé sur un pays absent doit atterrir quelque part de
 * plausible plutôt que sur le premier de la liste par hasard.
 */
export const defaultCountry = (): Country =>
  COUNTRIES.find((c) => c.code === deviceRegion()) ??
  COUNTRIES.find((c) => c.code === FALLBACK_REGION) ??
  COUNTRIES[0];
