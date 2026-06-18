// URL du backend.
// - En développement (Metro, `__DEV__` = true) → backend local sur ta machine.
// - Dans un build release / EAS (`__DEV__` = false) → backend Railway (cloud).
// Plus besoin de switcher l'IP à la main : le bon backend est choisi automatiquement.
//
// ⚠️ En dev local, mets ici ton IP locale (elle change selon le réseau Wi-Fi).
const LOCAL_URL = "http://192.168.1.181:3000";
const CLOUD_URL = "https://first-app-backend-production-c2db.up.railway.app";

export const BASE_URL = __DEV__ ? LOCAL_URL : CLOUD_URL;
