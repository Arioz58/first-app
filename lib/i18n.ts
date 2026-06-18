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

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: "tr",
  fallbackLng: "tr",
  interpolation: {
    escapeValue: false,
  },
});

// Restaure la langue choisie par l'utilisateur (persistée en SecureStore) au démarrage.
getLanguage().then((lang) => {
  if (lang && lang !== i18n.language) i18n.changeLanguage(lang);
});

// Change la langue de l'app et la persiste (le backend est mis à jour séparément via PATCH /users/me).
export const setAppLanguage = async (lang: string) => {
  await i18n.changeLanguage(lang);
  await saveLanguage(lang);
};

export default i18n;
