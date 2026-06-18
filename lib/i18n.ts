import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { getLanguage, saveLanguage } from "./storage";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import tr from "../locales/tr.json";

export const SUPPORTED_LANGUAGES = [
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
] as const;

const FALLBACK = "tr";
const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as string[];

// Langue de l'appareil si on la supporte, sinon turc.
const deviceLanguage = (): string => {
  const code = Localization.getLocales()?.[0]?.languageCode;
  return code && SUPPORTED_CODES.includes(code) ? code : FALLBACK;
};

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: deviceLanguage(), // détection auto au 1er lancement
  fallbackLng: FALLBACK,
  interpolation: {
    escapeValue: false,
  },
});

// Si l'utilisateur a déjà choisi une langue (persistée), elle prime sur celle de l'appareil.
getLanguage().then((lang) => {
  if (lang && lang !== i18n.language) i18n.changeLanguage(lang);
});

// Change la langue de l'app et la persiste (le backend est mis à jour séparément via PATCH /users/me).
export const setAppLanguage = async (lang: string) => {
  await i18n.changeLanguage(lang);
  await saveLanguage(lang);
};

export default i18n;
