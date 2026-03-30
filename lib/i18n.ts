import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "../locales/en.json";
import fr from "../locales/fr.json";
import tr from "../locales/tr.json";

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

export default i18n;
