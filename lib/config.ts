// URL du backend.
// - En développement (Metro, `__DEV__` = true) → backend local sur ta machine.
// - Dans un build release / EAS (`__DEV__` = false) → backend Railway (cloud).
// Plus besoin de switcher l'IP à la main : le bon backend est choisi automatiquement.
//
// ⚠️ En dev local, mets ici ton IP locale (elle change selon le réseau Wi-Fi).
const LOCAL_URL = "http://192.168.1.181:3000";
const CLOUD_URL = "https://first-app-backend-production-c2db.up.railway.app";

export const BASE_URL = __DEV__ ? LOCAL_URL : CLOUD_URL;

// Politique de confidentialité — affichée au consentement à l'inscription.
// ⚠️ Placeholder : remplacer par l'URL réelle (page first-app-web) dès qu'elle existe.
export const PRIVACY_URL = "https://nexa.app/privacy";
// Version de la politique acceptée (envoyée au backend pour tracer le consentement).
// Incrémenter à chaque révision du texte légal.
export const PRIVACY_POLICY_VERSION = "1.0";

// GIFs — la clé Giphy a été DÉPLACÉE côté serveur (variable d'environnement
// `GIPHY_API_KEY` du backend, proxy `GET /giphy`). Elle n'a plus rien à faire ici :
// écrite en dur, elle partait dans le bundle et ne pouvait pas être révoquée sans
// publier une nouvelle version de l'application. Ne pas la réintroduire.

// Lien d'invitation envoyé par SMS aux contacts qui n'ont pas encore Nexa.
// ⚠️ Placeholder : remplacer par le vrai lien store (App Store / Google Play,
// ou une page de redirection) dès que l'app est publiée.
export const INVITE_URL = "https://nexa.app/get";
