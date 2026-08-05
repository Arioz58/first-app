# Android — ce qu'il reste à faire

Le développement se fait sur iOS, mais l'app sort sur les **deux** stores (App Store + Google Play, Mois 6).
Ce fichier recense tout ce qui n'a **pas** été vérifié côté Android, ou qui y demande un travail à part.

Trois états sont utilisés :
- **[ ] à faire** — rien n'existe encore ;
- **[?] à vérifier** — le code est écrit et censé marcher, mais n'a jamais tourné sur Android ;
- **[✓] fait** — traité et validé.

État du dossier natif au 1er août 2026 : `android/` date du **5 juin** et ne contient donc **aucun** des changements
récents (icône de notification, contacts, audio, thème…). Tout test commence par `npx expo prebuild -p android`.

---

## 0. Avant de pouvoir tester quoi que ce soit

- [ ] Un appareil Android physique ou un émulateur (aucun n'a servi jusqu'ici).
- [ ] `npx expo prebuild -p android` puis `npm run android`. ⚠️ `android/` est **gitignoré** : il se régénère, aucune modification manuelle ne doit y être faite.
- [ ] Vérifier que `LOCAL_URL` (`lib/config.ts`) est joignable depuis l'appareil : l'émulateur Android n'atteint **pas** `localhost` de la machine (`10.0.2.2` pour l'émulateur, l'IP Wi-Fi pour un appareil réel).

---

## 1. Notifications push (chantier du 1er août 2026)

Le rendu iOS est validé sur iPhone. **Rien n'a été testé sur Android.**

- [?] **Réception des push** : jeton Expo, app en arrière-plan et app fermée. Le canal `default` est créé au démarrage (`lib/notifications.ts`) et déclaré dans le plugin `expo-notifications`.
- [?] **Petite icône (barre d'état)** : `assets/images/notification-icon.png` (silhouette blanche + alpha) et couleur `#1E40AF`, posées via le plugin. Sans elle, Android affiche l'icône de l'app pleine → **carré blanc**. À confirmer visuellement.
- [?] **Permission `POST_NOTIFICATIONS`** (Android 13+) : `requestPermissionsAsync()` est censé la demander à l'exécution. À vérifier sur une version récente.
- [?] **Deep link** : taper la notification doit ouvrir la conversation (`app/_layout.tsx`).
- [?] **Socket coupé en arrière-plan** (`AppState` → `pauseSocket`) : le correctif vaut pour les deux plateformes, mais le processus Android survit plus longtemps en arrière-plan — la fenêtre sans notification y était potentiellement bien plus large qu'iOS. À mesurer.
- [ ] **Credentials FCM dans EAS** : contrairement à iOS (clé APNs déjà créée lors des builds TestFlight), Android exige une clé **FCM V1** (compte de service Firebase) côté EAS, et vraisemblablement un `google-services.json` + `android.googleServicesFile` dans `app.json`. Aucun des deux n'existe aujourd'hui. Un projet Firebase existe déjà (il servait à `firebase-admin` avant la bascule sur Expo Push) : il faudra y **ajouter une app Android**.
- [ ] **Grande icône = photo de l'expéditeur** : elle s'affiche **à droite depuis Android 12** (changement de gabarit système), et à gauche seulement jusqu'à Android 11. Pour le rendu « conversation » façon WhatsApp — avatar à gauche, section *Conversations*, bulles — il faut `MessagingStyle` + shortcuts de conversation, **non exposés par `expo-notifications`** → module natif Kotlin à écrire. À chiffrer avant de s'engager.
- [ ] **Avatars par défaut** : sur iOS, l'extension **dessine** l'avatar manquant — l'initiale sur pastille pour une personne, deux silhouettes (`person.2.fill`) pour un groupe sans photo. Android n'a pas d'équivalent : sa grande icône vient d'une **URL**, donc sans photo il n'y a rien à afficher et l'icône de l'app reste. Deux voies possibles :
  - jeu de PNG statiques (A-Z + caractères turcs + `?` + un avatar de groupe) sur S3/CloudFront, l'URL se déduisant de l'initiale — zéro CPU, zéro dépendance, mais un upload à faire dans le bucket ;
  - route backend générant l'image à la volée — plus souple, mais ajoute une dépendance de rendu et une URL publique à configurer (pénible en dev, où l'IP change avec le Wi-Fi).
- [ ] **Messages de groupe — nom de l'expéditeur** : iOS affiche le groupe en titre, l'expéditeur en **sous-titre** et le message seul en corps ; l'extension reconstitue ça à partir de `senderName` / `messageBody` envoyés dans les données du push. Android n'a pas de sous-titre équivalent via `expo-notifications` : il reçoit le corps complet, **« Alice : salut »**, ce qui reste lisible mais met le nom sur la même ligne. `NotificationCompat` a bien `setSubText`, mais il n'est pas exposé — même piste que `MessagingStyle` ci-dessus (module natif).

---

## 2. Interface — ce qui rend différemment par nature

- [?] **`GlassSurface`** (barre de saisie du chat) : le flou n'est appliqué **que sur iOS**. Android reçoit une surface légèrement translucide, `expo-blur` y étant nettement plus coûteux et la barre étant redessinée à chaque frappe. À juger visuellement : si c'est trop plat, envisager une teinte plus marquée.
- [?] **`ProgressiveBlur`** (haut du fil de discussion) : plusieurs couches de flou masquées. Coût à surveiller sur un appareil d'entrée de gamme — prévoir de le désactiver sur Android si ça saccade au défilement ou à l'ouverture du clavier.
- [?] **Ombres** : Android ignore `shadowColor`/`shadowOpacity`/`shadowRadius` et n'utilise que `elevation`. Vérifier partout où une ombre porte le design : `BUBBLE_SHADOW`, `FLOATING_SHADOW`, `FAB_SHADOW`, `HEADER_SHADOW`.
- [?] **Onglets natifs** (`expo-router/unstable-native-tabs`) : les icônes sont des **SF Symbols**, propres à iOS. Vérifier ce que rend la tab bar Android et prévoir des icônes de remplacement si nécessaire.
- [?] **Badges d'onglets** (demandes d'ami sur Contacts, messages non lus sur Discussion) : le point sans texte est documenté **Android uniquement** — c'est iOS qui impose d'afficher un nombre. Vérifier le rendu Android des deux, et le comportement au-delà de 99 (`99+`). Le compteur lui-même est du JS partagé (`lib/friendRequests.ts`, `lib/unreadMessages.ts`), donc identique sur les deux plateformes.
- [ ] **Pastille de l'icône de l'app** : `setBadgeCountAsync` n'est appliqué par Android que si le **launcher** le prend en charge (Samsung One UI, Nova… l'AOSP ne l'affiche pas), et le champ `badge` du push est **iOS uniquement** — sur Android la pastille ne bougera donc pas app fermée. Vérifier ce que donne le launcher de test ; si le besoin est réel, passer par un compteur de notifications actives (`setNotificationChannelAsync` + `showBadge`) plutôt que par un nombre.
- [?] **Edge-to-edge** (`edgeToEdgeEnabled: true`) : contrôler que rien ne passe sous la barre de statut ni sous la barre de navigation gestuelle, en particulier le FAB (`FAB_BOTTOM = 96`, calé sur la tab bar iOS) et la barre de saisie du chat.
- [?] **Retour prédictif** désactivé (`predictiveBackGestureEnabled: false`) : décider si on le réactive, et vérifier que le geste retour ferme bien les `BottomSheet`, modales et visionneuses plein écran.
- [?] **Icône adaptative et splash** : `adaptiveIcon` pointe sur `icon.png` sur fond `#1E40AF` — vérifier le masquage circulaire, qui rogne les bords. L'icône iOS 26 (`Nexa-icon-comp.icon`) ne concerne pas Android.
- [?] **Mode sombre** : piloté par NativeWind, censé être identique. À parcourir écran par écran.
- [?] **Gestes de glissement sur la liste des conversations** (`ReanimatedSwipeable`) : vérifier qu'ils ne rentrent pas en concurrence avec le **geste retour** d'Android (bord gauche de l'écran) — c'est exactement la zone où l'on démarre le glissement « Non lu / Épingler ». Si le retour l'emporte, réduire la zone d'activation ou n'ouvrir qu'à partir d'un seuil plus large.
- [?] **Clavier** : `react-native-keyboard-controller` se comporte différemment selon `windowSoftInputMode`. Vérifier la barre de saisie du chat et les modales de saisie.
- [?] **`maintainVisibleContentPosition`** (chargement de l'historique vers le haut, `app/chat/[id].tsx`) : supporté sur Android depuis RN 0.72 — le projet est en 0.81 — mais son comportement y a longtemps été plus irrégulier que sur iOS. Vérifier en remontant un long fil : la position ne doit pas sauter quand une page s'insère en tête. Surveiller aussi l'interaction avec la fenêtre de suivi du bas (`FOLLOW_WINDOW_MS` / `OPEN_FOLLOW_WINDOW_MS`), les deux agissant sur l'offset de la même liste. En cas de saut, replier sur une compensation manuelle (mesurer la hauteur du contenu avant/après insertion, puis `scrollToOffset`).

---

## 3. Modules natifs à valider un par un

- [?] **expo-camera** (`StoryCamera`) : le zoom continu et la bascule vers l'ultra grand angle reposent sur `getAvailableLensesAsync()`, dont le comportement diffère (et manque souvent) sur Android. Prévoir un repli propre : zoom numérique seul, sans sélecteur 0,5×.
- [?] **react-native-video-trim** (rognage des vidéos de story) : vérifier que `enablePreciseTrimming` donne le même résultat.
- [?] **expo-audio** : le routage audio. `enterPlaybackMode()` pose `shouldRouteThroughEarpiece: false` pour Android, à confirmer après un enregistrement vocal.
- [?] **Enregistrement vocal** : `metering` (niveaux de l'onde) n'est pas garanti sur toutes les versions d'Android — le tracé peut rester plat.
- [?] **expo-contacts** : lecture du carnet et normalisation des numéros, permission runtime.
- [?] **expo-sms** : l'invitation SMS pré-remplie.
- [✓] **Partage de documents** : `expo-sharing` (et non `Share` de React Native, qui n'accepte pas d'URL `file://` sur Android) + type MIME explicite, requis pour que la feuille de partage propose des applications. Corrigé le 31 juillet, **non vérifié sur appareil**.
- [?] **`DocumentViewer`** (`react-native-webview`) : Android ne rend pas les PDF nativement dans une WebView — l'écran de repli « télécharger » sera probablement la norme. À confirmer, et à ajuster si le repli s'affiche trop souvent.
- [?] **QR** : `QrScanner` (expo-camera) et le rendu de `QrCode` (pur JS, devrait être identique).
- [?] **expo-media-library** : enregistrement dans la galerie + permissions (scopées différemment depuis Android 10).

---

## 4. Cartes (localisation, Mois 3)

- [ ] **Clé API Google Maps obligatoire** : `react-native-maps` utilise Apple Maps sur iOS (aucune clé), mais **Google Maps sur Android**. Sans clé, la carte s'affiche **grise et vide** — l'app ne plante pas, ce qui rend le symptôme facile à mal interpréter. La clé se crée sur un compte Google Cloud (côté client), avec l'API « Maps SDK for Android » activée, puis se déclare dans `app.json` sous `android.config.googleMaps.apiKey`. ⚠️ Ne pas l'écrire en dur dans le dépôt : passer par une variable d'environnement EAS, la règle du projet valant aussi ici (cf. `GIPHY_API_KEY`, déjà commitée par erreur).
- [ ] Restreindre la clé côté Google Cloud (empreinte SHA-1 du certificat de release + nom de paquet), sinon elle est utilisable par n'importe qui une fois l'APK distribué.
- [?] Vérifier le rendu de l'aperçu de position dans une bulle : sur Android, une `MapView` non interactive dans une liste peut être coûteuse — `liteMode` existe précisément pour ce cas et n'a pas d'équivalent iOS.

## 5. Build et distribution

- [ ] Premier build EAS Android (`preview` produit un APK, pratique pour tester sans le Play Store).
- [ ] Keystore de release (généré et conservé par EAS).
- [ ] Compte Google Play Console (frais unique 25 $) + fiche du magasin.
- [ ] `eas submit` Android : la section `submit.production` d'`eas.json` est vide.
- [ ] Politique de confidentialité en ligne : Google Play l'exige, et `PRIVACY_URL` est encore un placeholder (`lib/config.ts`).
- [ ] Déclaration de collecte de données (Data Safety) : contacts, numéro de téléphone, photos, notifications.

---

## 6. Rappels

- Ne jamais livrer un chemin de code dégradé sur Android en se justifiant par « le développement se fait sur iOS ». Si une différence de plateforme est inévitable, la traiter explicitement **dans les deux branches** et le dire.
- Toute fonctionnalité livrée doit s'accompagner de son résultat **iOS et Android** — ou de la mention explicite qu'il n'y a aucune différence.
