# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes principales

```bash
npm start                                    # Démarrer Metro (développement)
npm run ios                                  # Lancer sur simulateur iOS
npx expo run:ios --device <device-id>        # Lancer sur iPhone physique
npm run android                              # Lancer sur émulateur Android
npm run web                                  # Lancer en mode web
npm run lint                                 # Lancer ESLint via expo lint
```

---

## Contexte projet

Application de messagerie communautaire ciblant le marché turc (V1), avec ambition internationale.
Client : Hakan. Budget : 28 000€ (V1) + 6 000€ (V2) + 1 000€/mois maintenance. Délai : 6 mois.

### DA (Design)

- **DA passée au bleu le 25 juil. 2026** (demande client) : toute l'app est en **nuances de bleu**, couleur principale `#1E40AF` (bleu roi). ⚠️ Le token Tailwind s'appelle toujours **`nexa`** mais vaut désormais `#1E40AF` (nom historique conservé pour ne pas casser les 23 fichiers qui l'utilisent — `bg-nexa`/`text-nexa`/`border-nexa`).
- Dégradés : bannière profil `#3B82F6`→`#1E3A8A`, anneau de story `#60A5FA`→`#1E40AF`→`#1E3A8A`. Fonds de pastille = `bg-blue-50`/`bg-blue-100`.
- **Point « en ligne » conservé en vert** (`bg-green-500`) : convention universelle de statut, volontairement pas bleu.
- `lib/bubbleColors.ts` : palette de personnalisation (choix perso des bulles) — défaut désormais `#1E40AF`, mais la palette garde de la variété (dont des verts) car ce sont des choix utilisateur, pas la marque.
- Tab bar : **native iOS** (`expo-router/unstable-native-tabs`) avec SF Symbols — pas de tab bar custom JS ; onglet actif teinté via `tintColor="#1E40AF"` sur `<NativeTabs>`.
- **Mode clair / sombre** (depuis le 29 juil. 2026) : variants `dark:` de NativeWind pilotés par `lib/theme.ts` (`colorScheme.set`), préférence `system` (défaut) / `light` / `dark` persistée en SecureStore, restaurée par `initTheme()` dans `app/_layout.tsx` **avant le rendu**, réglable dans le Profil. Pour les props de couleur en dur (icônes, `ActivityIndicator`, `LinearGradient`), utiliser le hook `useThemeColors()` — palette sémantique (`canvas`/`surface`/`card`/`content`/`muted`/`faint`/`line`/`nexa`), l'accent passant de `#1E40AF` (clair) à un bleu plus lumineux en sombre. `userInterfaceStyle: "automatic"` dans `app.json`.
- **Titres d'écran** : `text-4xl font-bold text-nexa` en tête des onglets (Discussion, Actus, Contacts, Vous).
- ⚠️ Le renom `#128C7E`→`#1E40AF` a touché `app.json` (adaptiveIcon + splash sombre `#0f172a`) → **rebuild natif requis** pour voir ces changements-là (les couleurs JS suffisent d'un reload Metro).
- **Taille de police = échelle Tailwind d'origine** (partout). ⚠️ **Ne pas** réintroduire d'override `theme.extend.fontSize` pour « agrandir » globalement : essayé le 25-26 juil. 2026, abandonné car agrandir la police **sans** agrandir les paddings/margins/hauteurs de conteneurs **casse les proportions** (texte trop gros dans des boîtes inchangées). L'agrandissement « +1 cran » validé n'a été conservé que sur les **avatars/éléments** (dimensions en props, cf. `UserAvatar` défaut 52 + `size={}` montés). Si un jour « plus grand » est redemandé : le faire **par écran**, police **et** espacements ensemble.

### Planning

- **Mois 1** ✅ — Architecture, BDD, auth (JWT + OTP), profils, consentement politique de confidentialité, i18n (tr/fr/en)
- **Mois 2** ✅ — Messagerie temps réel (Socket.io), groupes (API + rooms + gestion membres), push, frontend mobile complet
- **Mois 3** 🔄 — Stories 24h ✅ (éditeur texte riche + photo/vidéo, voir section dédiée), médias S3 ✅ (upload presigned + CloudFront), chat enrichi ✅ (Phases A→E : header profil, présence/frappe, mute/éphémères/épinglés/favoris, pièces jointes, refonte visuelle « verre » — voir section dédiée), messages système ✅, groupes enrichis (rôles/permissions) ✅, mode sombre ✅, répertoire de contacts façon WhatsApp ✅, QR de profil ✅, notifications push Expo 🔄 (**chantier en cours, non commité — voir section dédiée**), localisation 🔄 (phases 1 et 2 ✅ — ville au profil affichée sur les deux écrans, envoi de position ; **phase 3 arrière-plan à retester sur appareil réel verrouillé**), version web Next.js 🔜
- **Mois 4** — Appels audio/vidéo (Agora.io)
- **Mois 5** — Points, leaderboard, anti-spam, module B2B, dashboard admin, site vitrine + DA verte + sécurité hardening (rate limiting, helmet, validation stricte)
- **Mois 6** — QA, corrections, mise en production (App Store + Google Play + AWS)

---

## Repos du projet

```
first-app/           → ce repo — app mobile React Native (Expo)
first-app-backend/   → backend Node.js + Express (repo séparé, même machine)
first-app-web/       → Next.js — à créer au Mois 3
```

---

## Architecture technique

### Frontend mobile (ce repo)

- **Expo SDK 54** + **Expo Router** (routage fichier)
- **NativeWind v4** — Tailwind CSS via prop `className`
- **Native tabs** — `expo-router/unstable-native-tabs` (SF Symbols iOS, statut alpha SDK 54)
- **i18next + react-i18next** — 3 langues : turc (`tr`), français (`fr`), anglais (`en`)
- **expo-localization** — détection de la langue de l'appareil (i18n auto au 1er lancement) ⚠️ **module natif** (config plugin → rebuild requis après install)
- **expo-secure-store** — stockage JWT chiffré (pas AsyncStorage)
- **socket.io-client** — messagerie temps réel
- **expo-notifications + expo-device** — notifications push (jeton **Expo**, pas le jeton natif de l'appareil) + notifications locales in-app
- **react-native-gesture-handler + react-native-reanimated** — gestes (pinch/pan/rotation) + animations (éditeur de stories, zoom viewer)
- **expo-image-picker + expo-image-manipulator** — sélection + crop des médias stories
- **expo-camera** — caméra in-app (photo/vidéo) pour les stories ⚠️ **module natif** (rebuild requis après install) ; permissions caméra/micro déclarées dans `app.json`
- **react-native-video-trim** — rognage temporel des vidéos (API **headless** `trim(uri, { startTime, endTime })` en ms → vrai fichier découpé) ⚠️ **module natif** (rebuild requis, pas de config plugin : autolinking via `expo run:ios`)
- **expo-video-thumbnails** — miniatures de la timeline de rognage ⚠️ **module natif** (rebuild requis)
- **expo-linear-gradient** — fonds dégradés des stories texte ⚠️ **module natif** (rebuild requis)
- **expo-image** — affichage d'images
- **expo-video** — lecture vidéo dans le viewer stories + `MediaViewer` du chat ⚠️ **module natif** (rebuild requis après install : `npx expo run:ios`)
- **expo-audio** — enregistrement et lecture des messages vocaux (plugin `expo-audio` dans `app.json`) ⚠️ **module natif** (rebuild requis)
- **expo-document-picker** — pièces jointes documents du chat ⚠️ **module natif** (rebuild requis)
- **expo-file-system** — copie du fond de conversation en stockage permanent + téléchargement groupé des médias (import `expo-file-system/legacy`)
- **expo-location** — position et géocodage inverse (ville du profil, envoi de position) ⚠️ **module natif** (rebuild requis)
- **react-native-maps** (1.20.1, épinglée par le SDK 54) — cartes ⚠️ **module natif** ; Apple Maps sur iOS sans clé, **clé Google obligatoire sur Android**
- **expo-blur** — overlay de chargement du viewer stories + surfaces en verre du chat (`GlassSurface`, `ProgressiveBlur`) ⚠️ **module natif** (rebuild requis)
- **react-native-keyboard-controller** — position du clavier mesurée **nativement image par image** (`KeyboardProvider` monté dans `app/_layout.tsx` ; le chat utilise `useReanimatedKeyboardAnimation` pour **translater** le bloc liste+composeur — pas de `KeyboardAvoidingView` : redimensionner la liste à chaque frame fait recalculer FlashList) ⚠️ **module natif** (rebuild requis) — ne pas confondre avec le `KeyboardAvoidingView` de React Native, qui décale d'un bloc avec un temps de retard
- **@react-native-masked-view/masked-view** — masques en dégradé du flou progressif (`ProgressiveBlur`)
- **expo-contacts** + **libphonenumber-js** — répertoire du téléphone et normalisation E.164 (voir section Répertoire) ⚠️ **module natif** (rebuild requis)
- **expo-sms** — SMS d'invitation pré-rempli pour les contacts sans compte
- **expo-sharing** — partage de fichiers **iOS + Android** (`content://` via FileProvider) ; ⚠️ ne pas repartir sur `Share` de React Native, qui n'accepte pas d'URL `file://` sur Android
- **expo-media-library** — enregistrement des médias dans la galerie ⚠️ **module natif** (rebuild requis)
- **react-native-webview** — visionneuse de documents in-app (`DocumentViewer`) ⚠️ **module natif** (rebuild requis)
- **@shopify/flash-list** (v2) — liste du fil de discussion (mesure réelle des cellules, recyclage, `startRenderingFromBottom`) — pur JS, pas de rebuild ; ⚠️ exige la nouvelle architecture (`newArchEnabled: true`, déjà actif)
- **qrcode** (+ `@types/qrcode`) — QR de profil rendu en **pur JS** (aucun module natif), voir `components/QrCode.tsx`
- **expo-haptics** — retours haptiques (capture, envoi, scan QR, tuiles de pièces jointes)
- **expo-clipboard** — action « Copier » du menu contextuel d'un message ⚠️ **module natif** (rebuild requis après install)
- **@bacons/apple-targets** — extension de notification iOS (`targets/`) ⚠️ **module natif** (rebuild requis) — voir la section Notifications push
- **moti** — animations déclaratives de l'onboarding et de `StepIndicator`
- TypeScript strict

### Backend (`first-app-backend/`)

- Node.js + Express + TypeScript
- Prisma v5 + PostgreSQL (RDS en prod, Docker en local)
- Redis (ElastiCache en prod, Docker en local)
- Socket.io — messagerie temps réel + vérification membership
- JWT access (15min) + refresh tokens (7j) — auto-refresh côté client
- **expo-server-sdk** — envoi des notifications push par le service Expo (🔄 remplace `firebase-admin`, supprimé)
- Nettoyage automatique stories expirées toutes les heures + messages éphémères expirés toutes les 5 min (setInterval)

### Infrastructure AWS (prod)

- ECS → backend Docker, RDS PostgreSQL, ElastiCache Redis, S3 + CloudFront (médias), API Gateway

### Services tiers

- **Agora.io** — appels audio/vidéo (Mois 4)
- **Expo Push** — notifications push (🔄 remplace l'envoi direct Firebase/FCM, chantier en cours — voir la section dédiée)
  - Expo relaie vers APNs et FCM avec ses propres identifiants : plus de clé APNs ni de `GoogleService-Info.plist` côté serveur
  - ⚠️ iOS : compte Apple Developer payant (99€/an) toujours nécessaire — c'est lui qui porte l'entitlement `aps-environment`
- **Google Maps + expo-location** — localisation (Mois 3)
- **Twilio** — OTP SMS en prod (simulé en local via console.log)

---

## Structure de l'app mobile

```
app/
├── _layout.tsx          # Layout racine — vérif JWT expiry + handler SESSION_EXPIRED global + socket + push + `initTheme()` (thème restauré avant rendu) + `KeyboardProvider` + listeners sociaux (notifs in-app) + **ouverture depuis une notification** (deep link → `/chat/<conversationId>`)
├── globals.css
├── (auth)/              # Flux : welcome → security → intro → login → verify
│   ├── _layout.tsx
│   ├── welcome.tsx      # Écran d'accueil NEXA (slogan + image + Continuer) → security
│   ├── security.tsx    # Argument sécurité/confidentialité (Moti) → intro
│   ├── intro.tsx        # « Discutez librement » (Commencer / J'ai déjà un compte → login isNew=1/0)
│   ├── login.tsx        # Saisie numéro + indicatif pays (CountryPicker, placeholder adaptatif via `Country.example`) — prénom + case consentement politique de confidentialité (lien PRIVACY_URL) si nouveau compte ; bouton désactivé tant que non coché
│   └── verify.tsx       # Saisie OTP (6 champs individuels, auto-avance, coller) → JWT + socket + FCM ; renvoi du code après cooldown `RESEND_COOLDOWN` (45s, compte à rebours) ; si `isNew=1` → POST /users/me/privacy-consent (consentement + version PRIVACY_POLICY_VERSION)
├── (tabs)/
│   ├── _layout.tsx      # NativeTabs (SF Symbols) — 5 onglets : Messages · Actus (`sparkles`) · Contacts · Appels · Vous
│   ├── index.tsx        # Onglet **« Discussion »** (libellé i18n `messages`) — liste des conversations : **barre de recherche toujours visible** (résultats groupés Discussions [local] / Messages [GET /conversations/search-messages, débouncé] / Contacts [GET /friends?q=]), filtres (Toutes/Non lues/Favoris/Groupes), avatars réels, horodatage, badge non-lus, épinglé/favori/muet, temps réel via `conversation_updated`, appui long → actions, FAB « + » (`FAB_BOTTOM = 96`, la tab bar native flotte au-dessus du contenu) → nouvelle conversation / nouveau groupe / **répertoire** (`requestContactsSegment('directory')`). ⚠️ Plus de StoriesBar ici (migrée vers Actus)
│   ├── updates.tsx      # Onglet **Actus** : StoriesBar en tête (fixe) + 2 segments — **Activité** (demandes d'ami reçues + `<FloatingSuggestions>` : suggestions « personnes que tu connais peut-être » en **orbite animée façon iCloud** autour de mon avatar, tap → profil) et **Communauté** (coquille « en développement » : points/leaderboard/B2B au Mois 5)
│   ├── search.tsx       # Onglet **« Contacts »** (fichier/route toujours `search`), segmenté **« Répertoire / Amis »**. Répertoire = `<DirectoryPanel>` (carnet du téléphone, voir section Répertoire). Amis = `<FriendsPanel>` + pastille rouge des demandes en attente sur le segment. Header : bouton **scan QR** (`<QrScanner>`, overlay magic-move depuis le bouton via `measureInWindow`) + bouton **ajout par numéro** (`<AddContactSheet>` — l'ancienne recherche par NUMÉRO, désormais en drawer : CountryPicker, debounce, carte → profil, historique récent). Ouverture sur un segment imposé via `consumeContactsSegment()`
│   ├── saved.tsx        # Appels (à implémenter Mois 4)
│   └── profile.tsx      # Onglet **« Vous »** (refonte 29 juil.) : bannière + avatar+photo (upload S3 ; appui = Changer/Supprimer → PATCH photoUrl:null = retour à l'initiale), édition nom + bio (modale combinée, bio 140 car.), **3 stats cliquables** (amis/groupes/stories via `GET /users/me/stats`), **QR de profil** (modale, `Linking.createURL('/user/<id>')` → `nexa://user/<id>`) + partage du contact, puis sections en cartes : Préférences (**apparence** clair/sombre/système, langue i18n), Confidentialité (réglages, bloqués, statut de consentement), À propos (version), déconnexion → welcome (⚠️ `unregisterPushToken()` **avant** `clearTokens()`)
├── chat/
│   ├── [id].tsx         # Écran chat temps réel (Socket.io) — header profil, présence/frappe, médias, vocal, épinglés/favoris (voir section Chat)
│   ├── details.tsx      # Panneau de détails d'une conversation directe (UI en cartes, en-tête bannière + point de présence) : profil gated, actions rapides (appel/vidéo/favori/muet/recherche), personnalisation (fond/surnom/couleur de bulle/éphémère), **groupes (gated ami : créer un groupe avec / ajouter à un groupe admin)**, **amis en commun (avatars empilés → liste)**, médias (tuiles compteur), épinglés, favoris, gestion (effacer/bloquer/signaler)
│   ├── media.tsx        # Galerie par catégorie (media/links/documents/audio/gifs) — grille ou liste, pagination curseur, téléchargement groupé
│   └── new.tsx          # Sélecteur d'ami pour démarrer une conversation (GET /friends + filtre local) → POST /conversations/direct → `router.replace` vers le chat
├── user/
│   └── [id].tsx         # Profil complet d'un autre utilisateur (gated) : skeleton, boutons dynamiques amis/message/appels, GET /users/:id/profile
├── privacy.tsx          # Paramètres de confidentialité (8 réglages everyone/friends/nobody + amis-d'amis pour les demandes + toggle localisation + accès Utilisateurs bloqués) → PATCH /users/me/privacy
├── blocked.tsx          # Page Utilisateurs bloqués (liste + débloquer) → GET/DELETE /blocks
├── requests.tsx         # Demandes de messages (liste convs en attente + accepter/supprimer) → /conversations/requests
├── group/
│   ├── new.tsx          # Création de groupe : nom + recherche de membres (useUserSearch, chips sélectionnés) — plus de saisie d'ID bruts
│   └── [id].tsx         # **Détails d'un groupe** (ouvert au tap sur le header d'un chat de groupe) : en-tête éditable admin (photo/nom/description), liste des membres avec **rôles** (admin/modérateur/membre) + menu d'actions selon droits (promouvoir/rétrograder/retirer), ajouter des membres, médias, mute/éphémères, **paramètre « qui peut envoyer »** (admin), quitter
└── story/
    ├── [id].tsx         # Viewer stories (photo/vidéo, progress bar, pause au maintien, zoom, ordre chrono) — voir section Stories
    └── create.tsx       # Éditeur de story (photo/vidéo, textes stylables multiples, guides d'alignement, upload S3)
components/
├── StoriesBar.tsx       # Barre stories horizontale (style WhatsApp, useFocusEffect refresh) — montée en tête de l'onglet **Actus** (`updates.tsx`), plus dans Messages
├── DirectoryPanel.tsx   # Répertoire du téléphone (SectionList) : raccourcis + « Sur Nexa » + « Inviter » (SMS) — voir section Répertoire
├── AddContactSheet.tsx  # Drawer d'ajout par NUMÉRO (CountryPicker + POST /users/search-by-phone + historique récent)
├── QrCode.tsx           # QR de profil rendu en pur JS (lib `qrcode`, segments de modules → peu de Views ; fond blanc fixe même en sombre)
├── QrScanner.tsx        # Scanner QR plein écran (expo-camera) — ouverture « magic move » depuis le bouton, cadre animé, haptique
├── GlassSurface.tsx     # Surface en verre dépoli (`BlurView` iOS / translucide Android) + `FLOATING_SHADOW` — barre de saisie et boutons flottants du chat
├── ProgressiveBlur.tsx  # Flou en **dégradé** (couches masquées empilées, `MaskedView`) — bord haut du fil de discussion
├── AttachmentSheet.tsx  # Drawer de pièces jointes (tuiles en cascade, haptique ; `coming` = action annoncée non livrée)
├── PendingMediaBar.tsx  # Vignettes des médias choisis mais pas encore envoyés (miniature vidéo, retrait à l'unité)
├── MediaGrid.tsx        # Grille d'un **album** (médias d'un même envoi) : 2 côte à côte, 3 = 2+1, 4+ = 2×2 avec « +N »
├── AlbumViewer.tsx      # Visionneuse d'album plein écran (pagination + bande de miniatures)
├── DocumentViewer.tsx   # Visionneuse de documents in-app (WebView : PDF/texte/images ; repli téléchargement sinon). ⚠️ **Aucun** service de conversion tiers (ne pas envoyer d'URL privée à Google Docs Viewer)
├── VoiceRecorderBar.tsx # Barre d'enregistrement vocal (chrono, annulation, envoi) + niveaux via `metering`
├── VoiceMiniPlayer.tsx  # Rappel du vocal en cours quand on a quitté sa conversation — monté dans `app/_layout.tsx`, sinon il disparaîtrait avec l'écran
├── VoiceWaveform.tsx    # Tracé d'onde : `LiveWaveform` (fenêtre glissante à l'enregistrement) et lecture avec seek au doigt
├── FloatingSuggestions.tsx # Suggestions d'amis en orbite animée (onglet Actus)
├── BlueAura.tsx         # Lueur bleue diffuse de l'onboarding (28 disques superposés, pur JS — aucun bord visible)
├── StepIndicator.tsx    # Indicateur d'étape de l'onboarding (5 segments, Moti)
├── DismissKeyboard.tsx  # Ferme le clavier au tap dans le vide (`accessible={false}`) ; pour les listes préférer `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode="on-drag"`
├── StoryBackground.tsx  # Fond de story texte (uni / dégradé via expo-linear-gradient)
├── StoryCamera.tsx      # Caméra in-app (photo tap / vidéo maintien, flash, switch)
├── VideoTrimmer.tsx     # Rognage vidéo : preview + timeline à miniatures (trim headless)
├── EmojiPicker.tsx      # Sélecteur d'emojis (grille) pour les stickers de story
├── BottomSheet.tsx      # Drawer bottom-sheet réutilisable (SHEET_SPRING partagé : montage différé piloté par `visible`, drag-to-dismiss sur la poignée, backdrop en fondu) — hauteur fixe (liste) ou auto (contenu)
├── CountryPicker.tsx    # Sélecteur pays + indicatif — utilise `BottomSheet` (hauteur fixe 85% + recherche + FlatList)
├── UserAvatar.tsx       # Avatar circulaire réutilisable (photo ou initiale sur fond bleu nexa, prop `size`)
├── FriendsPanel.tsx     # Panneau Amis (sous-onglets mes amis / reçues / envoyées, actions inline, badge demandes) — segment « Amis » de l'onglet Contacts
├── ChatBackground.tsx   # Fond de conversation (asset nexa clair/sombre par défaut, preset couleur/dégradé, ou photo perso)
├── ChatWallpaperPicker.tsx # Sélecteur de fond de conversation (BottomSheet, presets + galerie, aperçu live)
├── MessageText.tsx      # Texte d'une bulle : formatage `*gras*`/`_italique_`/`~barré~`/`` `mono` ``, liens **tous** cliquables, repli « Voir plus » au-delà de 8 lignes (débordement **mesuré**, pas deviné)
├── LinkPreviewCard.tsx  # Carte d'aperçu Open Graph (le **domaine** toujours affiché en premier : titre et image viennent du site, le domaine est le seul repère vérifiable)
├── MessageInfoSheet.tsx # Statuts détaillés d'un message, membre par membre — **aucune requête**, tout vient des accusés déjà chargés
├── QuotedMessage.tsx    # Aperçu d'un message cité — **un seul composant pour deux emplacements** (dans la bulle, au-dessus du champ de saisie)
├── MessageActions.tsx   # Menu contextuel d'un message (6 réactions rapides + « + », puis les actions) — placé **contre la bulle**, mesurée à l'appui long
├── MessageReactions.tsx # Pastilles de réactions sous la bulle + feuille « qui a réagi »
├── ForwardSheet.tsx     # Transférer un message vers plusieurs conversations (le média est réutilisé par son URL S3, sans re-téléversement)
├── MessageMedia.tsx     # Rendu d'une pièce jointe dans la bulle selon `mediaType` (image/gif, vidéo, audio, document)
├── MediaViewer.tsx      # Visionneuse plein écran image/vidéo (Modal, expo-video pour la vidéo)
├── AudioMessage.tsx     # Lecteur de message vocal (expo-audio : play/pause + progression + durée)
└── GiphyPicker.tsx      # Recherche de GIFs Giphy (tendances + recherche débouncée) — désactivé si clé absente
lib/
├── api.ts               # Fetch wrapper — JWT Bearer + auto-refresh + handler SESSION_EXPIRED global
├── socket.ts            # Client Socket.io singleton
├── storage.ts           # SecureStore : accessToken, refreshToken, userId, language + réglages **locaux** de conversation (fond, surnom/couleur de bulle, horodatage « effacer »)
├── useUserSearch.ts     # Hook recherche d'utilisateurs (debounce 300ms + anti-race) → GET /users/search
├── notifications.ts     # Permission + enregistrement du **jeton Expo** au backend (`getExpoPushTokenAsync`) + `unregisterPushToken()` à la déconnexion
├── countries.ts         # Liste pays avec drapeau, nom et indicatif téléphonique
├── storyText.ts         # Styles texte stories (couleur, fond none/translucent/solid, gras/italique/souligné) — partagé create + viewer
├── storyBackgrounds.ts  # Presets de fond stories texte (id → couleurs unies/dégradés)
├── storyStickers.ts     # Liste d'emojis stickers + STICKER_FONT_SIZE (partagé create + viewer)
├── upload.ts            # Upload générique S3 (presigned → PUT → URL CloudFront) + formatFileSize + firstUrl (détection de lien)
├── chatWallpapers.ts    # Presets de fond de conversation (asset nexa clair/sombre + unis/dégradés) — réglage local
├── bubbleColors.ts      # Palette de couleurs d'accent des bulles « moi » (réglage local)
├── chatNav.ts           # Relais mémoire one-shot : détails → chat, « défiler jusqu'à ce message » (épinglé/favori)
├── tabsNav.ts           # Relais mémoire one-shot : FAB → onglet Contacts, segment à ouvrir (un param de route ne se redéclencherait pas au 2ᵉ passage, valeur identique)
├── friendRequests.ts    # Store externe (`useSyncExternalStore`) du **compteur de demandes d'ami reçues** — alimente le badge natif de l'onglet Contacts et la pastille du segment Amis
├── unreadMessages.ts    # Store externe du **total de messages non lus** (détail par conversation) — badge de l'onglet Discussion **et** pastille de l'icône de l'app
├── config.ts            # BASE_URL (local/Railway selon `__DEV__`) + PRIVACY_URL / PRIVACY_POLICY_VERSION + GIPHY_API_KEY + INVITE_URL (⚠️ 3 placeholders + 1 clé en dur, cf. Sécurité)
├── voicePlayback.ts     # Vocal en cours au niveau de l'APP (store externe) — ne porte que la description + un rappel `stop` ; le lecteur natif reste dans son composant
├── threadScroll.ts      # **Position dans le fil de discussion** — machine à états (`opening`/`anchored`/`following`/`jumping`), **un seul propriétaire du défilement** à la fois. Remplace les 9 refs qui s'annulaient mutuellement (voir la section Chat)
├── theme.ts             # Thème clair/sombre : `ThemePref`, `getThemePref`/`setThemePref` (SecureStore), `initTheme()` au démarrage, `useThemeColors()` (palette sémantique pour les props en dur)
├── contacts.ts          # Répertoire : permission, normalisation E.164 (libphonenumber-js, région déduite de `expo-localization`, défaut TR), `POST /users/contacts/match`, **cache mémoire** du dernier résultat (évite de re-synchroniser à chaque bascule de segment → rate limit)
├── documents.ts         # Documents : extension/MIME, `isViewableDocument` (formats rendus par WebView), téléchargement + partage **iOS et Android** (`expo-sharing`, type MIME requis côté Android)
├── audioMode.ts         # Session audio : `enterRecordingMode` / `enterPlaybackMode`. ⚠️ À rappeler après tout enregistrement — sur iOS `allowsRecording:true` laisse la sortie sur l'**écouteur téléphonique** (son très faible) pour tout ce qui est lu ensuite, vocaux comme vidéos
└── i18n.ts              # Config i18next (tr/fr/en) + SUPPORTED_LANGUAGES + setAppLanguage (changeLanguage + persistance SecureStore) ; restaure la langue sauvegardée au démarrage
locales/
├── tr.json
├── fr.json
└── en.json
```

## Structure du backend

```
src/
├── index.ts                        # Express + Socket.io + nettoyage stories (setInterval 1h)
├── lib/
│   ├── prisma.ts                   # Client Prisma singleton
│   ├── redis.ts                    # Client Redis
│   ├── socket.ts                   # Socket.io : auth JWT + membership check + events + helpers emit
│   ├── push.ts                     # **Expo Push** : sendPushNotification / sendPushToMany (⚠️ remplace `fcm.ts`/firebase-admin — voir section Notifications push)
│   └── unread.ts                   # `countUnreadMessages` (SQL brut, 1 requête) → pastille de l'icône envoyée dans le push
├── middlewares/
│   └── auth.middleware.ts          # Middleware JWT → AuthRequest.userId
└── modules/
    ├── auth/                       # send-code (OTP Redis 5min) + verify-code + refresh
    ├── users/                      # Profil + consentement + fcmToken + recherche (GET /search nom + POST /search-by-phone numéro, rate-limité)
    ├── social/                     # relation.service.ts (helpers : areFriends, blockExistsBetween, getRelationStatus, mutualFriendsCount, canSee) + friends.* (/friends) + moderation.* (/blocks + /reports : blocage avec effets, signalement)
    ├── messages/                   # Conversations direct/groupe + messages + gestion membres
    ├── stories/                    # Stories 24h : CRUD + groupées par user (texts en colonne Json)
    └── upload/                     # Presigned URL S3 (lib/s3.ts) — folder/ext selon contentType
prisma/
└── schema.prisma                   # User, Profile, Conversation, ConversationMember, Message, PinnedMessage, StarredMessage, Story, StoryView, Call, Points, FriendRequest, Friendship, Block, Report...
```

### Endpoints disponibles

```
GET  /health
POST /auth/send-code                              → envoie l'OTP (Twilio ou simulation console) ; `{ phone, mode? }` — `mode:'login'` refuse si compte inexistant, `mode:'signup'` refuse si déjà existant
POST /auth/verify-code                            → vérifie OTP, crée user si nouveau, retourne JWT
POST /auth/refresh                                → renouvelle access token

GET  /users/search?q=                             → recherche d'utilisateurs (nom/numéro, ≥2 car., exclut soi-même, max 20 → id/name/photoUrl) — usage interne (membres de groupe)
POST /users/search-by-phone                       → recherche contact par numéro exact `{ phone }` (rate limit Redis 20/h, block-aware = compte masqué si bloqué, self-detection, photo gated) → `{ found, self?, user: { id, name, phone, photoUrl, relationStatus } }`
POST /users/contacts/match                        → matching du carnet d'adresses `{ phones: string[] }` en E.164 (rate limit 12/h, block-aware, gated + `relationStatus`, **non-stockage** des numéros) → cartes des contacts inscrits
GET  /users/me/stats                              → compteurs du profil `{ friends, groups, stories }`
GET  /users/:id/profile                           → profil complet gated (404 si bloqué) → champs filtrés selon la matrice de confidentialité + `relationStatus`, `requestId`, `isFriend`, `mutualFriendsCount`, `canMessage`, `canCall`, `canFriendRequest`, `online`
GET  /users/:id/mutual-friends                    → liste des amis en commun (id/name/photoUrl, triés par nom ; 404 si bloqué)

POST /friends/requests                            → envoyer une demande `{ toUserId }` (respecte privacyFriendRequests everyone/friends_of_friends/nobody, cooldown 7j après refus, auto-accept si demande inverse en attente)
POST /friends/requests/:id/accept                 → accepter (destinataire) → crée l'amitié
POST /friends/requests/:id/refuse                 → refuser (destinataire) → status refused + date (cooldown), A non notifié
DELETE /friends/requests/:id                      → annuler sa demande (émetteur)
GET  /friends/requests/received                   → demandes reçues en attente (+ createdAt)
GET  /friends/requests/sent                       → demandes envoyées en attente
GET  /friends?q=                                  → mes amis (recherche par nom optionnelle)
GET  /friends/suggestions                         → « personnes que tu connais peut-être » : amis d'amis non-amis, exclut soi/amis/bloqués/demandes en cours, triés par nb d'amis en commun (→ id/name/photoUrl/mutualFriendsCount)
DELETE /friends/:userId                           → retirer un ami

GET  /blocks                                      → mes utilisateurs bloqués
POST /blocks                                      → bloquer `{ userId }` (effets : amitié supprimée + demandes en attente annulées ; recherche/profil déjà masqués via blockExistsBetween)
DELETE /blocks/:userId                            → débloquer
POST /reports                                     → signaler `{ userId, category }` (spam | impersonation | inappropriate | other)
GET  /users/me                                    → profil complet
PATCH /users/me                                   → mise à jour (name, photoUrl, language sur User ; bio/privacyPresence/privacyPhoto routés sur Profile — `bio` effaçable via chaîne vide)
POST /users/me/privacy-consent                    → consentement politique de confidentialité (body `{ version }` → privacyConsent + privacyConsentAt + privacyPolicyVersion)
PATCH /users/me/location                          → ville affichée au profil `{ city, country }` (`city: null` efface). ⚠️ Donnée **déclarative** : le géocodage est fait par l'app, le serveur ne vérifie rien — n'en faire dépendre aucune règle
PATCH /users/me/privacy                            → met à jour la matrice de confidentialité (valeurs validées serveur : triple everyone/friends/nobody, friend_requests everyone/friends_of_friends/nobody, locationEnabled bool, **readReceipts bool**)
POST /users/me/fcm-token                          → enregistrer le jeton push (colonne `User.fcmToken`, contient désormais un **jeton Expo**) ; ⚠️ **transaction** qui le retire de tous les autres comptes — un jeton identifie un APPAREIL, pas un utilisateur
DELETE /users/me/fcm-token                        → libérer le jeton (appelé à la déconnexion, **avant** d'effacer la session)

POST /conversations/direct                        → créer/récupérer conv directe (refus si bloqué ou privacyMessages l'interdit ; non-ami avec privacyMessages=everyone → conv en « demande » pour la cible)
POST /conversations/group                         → créer groupe (admin = créateur)
GET  /conversations                               → liste convs ACCEPTÉES (member.accepted=true), **triée épinglées d'abord puis par date du dernier message**, enrichie par membre : `unreadCount`, `pinnedAt`, `favoritedAt`, `mutedUntil`, `lastMessageAt`
GET  /conversations/requests                      → demandes de messages reçues (member.accepted=false, ≥1 message)
GET  /conversations/search-messages?q=            → recherche plein-texte dans le contenu des messages de MES conversations acceptées (exclut éphémères expirés, ≥2 car., max 40) → message + conversation (type/name/members ciblés)
POST /conversations/:id/accept-request            → accepter une demande (rejoint les convs normales)
DELETE /conversations/:id/request                 → refuser/supprimer une demande
GET  /conversations/:id                           → métadonnées d'une conv (type, name, members, ephemeralDuration, myMutedUntil, myFavoritedAt) + **`firstUnreadId` / `unreadCount`** (repère « reprendre ici » : seul le serveur peut les trouver sans charger tout l'historique)
GET  /conversations/:id/messages                  → historique paginé (30/page). `cursor` remonte vers le PASSÉ, `newerCursor` redescend vers le PRÉSENT — le second sert quand le fil a été ouvert au milieu de l'historique
GET  /conversations/:id/messages/around/:messageId → fenêtre d'historique **centrée** sur un message (`before`/`after` bornés) + `hasOlder`/`hasNewer`. ⚠️ Seule façon d'atteindre une cible arbitrairement ancienne — repère de reprise avec 100 non-lus, épinglé d'il y a un mois : on ne peut pas défiler vers une ligne absente de la liste, et remonter page par page serait interminable
POST /conversations/:id/read                      → marquer la conv comme lue (`ConversationMember.lastReadAt = now`, **et `lastDeliveredAt`** : lire implique avoir reçu, sinon l'accusé de lecture sauterait par-dessus celui de réception) + diffuse `conversation_read`
PATCH /conversations/:id/pin                      → épingler/désépingler la conv pour MOI `{ pinned: bool }`
PATCH /conversations/:id/favorite                 → mettre/retirer la conv des favoris pour MOI `{ favorite: bool }`
PATCH /conversations/:id/archive                  → ranger/sortir des archives pour MOI `{ archived: bool }` (archiver retire l'épinglage)
POST /conversations/:id/unread                    → remettre en « non lu » à la main (`manualUnread`) ; `POST /read` le lève
PATCH /conversations/:id/mute                     → couper/réactiver mes notifications `{ mutedUntil }` (null = actives ; date lointaine = « toujours »)
PATCH /conversations/:id/ephemeral                → durée des messages éphémères `{ duration }` en secondes (null = désactivé) — s'applique à toute la conv
GET  /conversations/:id/search?q=                 → recherche dans UNE conversation (≥2 car., insensible à la casse, max 200, exclut système/supprimés/éphémères expirés via `liveMessages`) → id/content/createdAt/senderId, du plus récent au plus ancien
GET  /conversations/:id/pins                      → messages épinglés (niveau conversation, visibles par tous les membres)
GET  /conversations/:id/starred                   → mes messages favoris (personnel)
GET  /conversations/:id/flags                     → `{ pinned: string[], starred: string[] }` — ids pour décorer les bulles
POST/DELETE /conversations/:id/messages/:msgId/pin   → épingler / désépingler
POST/DELETE /conversations/:id/messages/:msgId/star  → mettre / retirer des favoris
PATCH /conversations/:id/messages/:messageId  → modifier le texte d'un de SES messages `{ content }` (15 min, texte seul) → socket `message_edited`
POST /conversations/:id/messages/:msgId/reaction  → poser / remplacer / retirer une réaction `{ emoji }` (`null` = retrait). ⚠️ **Une** réaction par personne (`@@unique([messageId, userId])`) : le même emoji reposé la RETIRE. Diffuse `message_reaction` avec l'**état complet** des réactions du message — jamais un delta, sinon deux réactions simultanées divergent
GET  /conversations/:id/media?category=&cursor=   → pièces jointes paginées (30/page) — `category` : media | images | videos | documents | audio | gifs | links
GET  /conversations/:id/media-counts              → compteurs par catégorie (images, videos, documents, audio, gifs, links)
POST /conversations/:id/members                   → ajouter membres (admin **ou modérateur**)
PATCH /conversations/:id/members/:userId/role     → changer le rôle d'un membre `{ role: admin|moderator|member }` (**admin requis**) + bandeau système
PATCH /conversations/:id/settings                 → réglage groupe `{ whoCanSend: all|admins }` (admin requis)
DELETE /conversations/:id/messages/:messageId?scope=me|all → supprimer. `me` = pour soi (table `MessageDeletion`, filtrée dans `liveMessages`) ; `all` = **soft delete** qui VIDE réellement `content`/`mediaUrl` (délai **2 jours** pour l'auteur, illimité pour admin/modérateur) → socket `message_deleted`. ⚠️ Le fichier S3 n'est pas supprimé (voir `todo`)
DELETE /conversations/:id/members/:userId         → expulser un membre (admin requis)
POST /conversations/:id/leave                     → quitter (promeut prochain admin si besoin)
PATCH /conversations/:id                          → éditer groupe (admin requis) : `name` / `photoUrl` / `description` (bandeau système « renommé » si name)

POST /receipts/delivered                          → accusé de RÉCEPTION depuis l'arrière-plan `{ conversationId, token }`. ⚠️ **Sans middleware d'auth, volontairement** : l'appelant est l'extension de notification iOS ou la tâche de fond Android, qui n'ont pas accès au JWT (trousseau de l'app). L'autorisation vient d'un **jeton signé** glissé dans le push (`src/lib/receipts.ts`, HMAC + expiration 7 j) qui n'autorise QUE marquer ce destinataire comme ayant reçu, dans cette conversation — aucune donnée, aucune session. Rejouer ne réécrit que la même date

POST /upload/presigned-url                        → URL S3 presignée (contentType → ext/folder) + publicUrl CloudFront ; `folder` optionnel (`chat` | `stories`) pour surcharger le dossier par défaut du type. Types autorisés : images, gif, vidéos, audio (m4a/mp3), documents (pdf/doc/docx/xls/xlsx/txt)
POST /stories                                     → créer story (mediaUrl + texts[] JSON, expire dans 24h)
GET  /stories                                     → stories actives **des amis uniquement**, groupées par user (liste vide si aucun ami)
GET  /stories/me                                  → mes stories actives (+ viewCount)
POST /stories/:storyId/view                       → enregistrer une vue (upsert idempotent, pas d'auto-vue, 403 si non-ami)
GET  /stories/:storyId/views                      → liste des viewers (propriétaire uniquement)
DELETE /stories/:storyId                          → supprimer (propriétaire uniquement)
```

### Socket.io — événements

```
// Client → Serveur (vérification membership sur chaque event)
join_conversation(conversationId)
send_message({ conversationId, content, type, mediaUrl?, mediaType?, fileName?, fileSize?, mimeType?, durationMs?, batchId? })
                                                  → `batchId` = médias envoyés d'un même geste (migration `message_batch`) : regroupés en UN album à l'affichage. Généré côté app (**`<userId>-<timestamp>#<nombre de médias>`**) et non côté serveur, chaque média partant dans son propre `send_message`. ⚠️ Le suffixe `#<n>` porte le **nombre attendu**, ce qui permet au destinataire de retenir l'album jusqu'à l'avoir en entier au lieu de voir les images tomber une par une (`batchExpected` dans `chat/[id].tsx`). Il voyage dans l'identifiant — chaîne opaque déjà relayée et stockée — précisément pour éviter une migration et un champ socket de plus. Il sert aussi **côté serveur** : un album ne déclenche qu'**une** notification (poussée sur le **premier** message, annonçant le nombre attendu — attendre le dernier la ferait arriver bien après, les messages étant espacés par la durée de chaque téléversement). ⚠️ Les messages suivants ne sont pas rendus muets mais basculent en **push silencieux** : les couper priverait un destinataire hors ligne de leur accusé de réception, qui voyage dans le push. Séparateur `#` et non `-` : les identifiants d'utilisateur en contiennent, et l'ancien format finissait par un horodatage qu'on lirait comme un compte gigantesque ; sans `#` on retombe sur 1, donc sur l'ancien comportement (ce que font les albums déjà en base)
typing({ conversationId, typing })                → relayé aux autres membres en `peer_typing`
leave_conversation(conversationId)

// Serveur → Client
new_message(message)                              → refus si blocage (conv directe) ; pièces jointes + `hasLink` (détection d'URL) + `expiresAt` si la conv est en éphémère ; + push aux destinataires offline **acceptés** (titre = nom de l'expéditeur en direct, **nom du groupe** en groupe avec « Alice : … » dans le corps ; illustration = photo du groupe ou de l'expéditeur ; `data` porte `conversationId`, `senderName`, `avatarUrl` — lus par l'extension iOS) (pas de push aux membres en « demande » accepted=false → badge uniquement, ni aux membres ayant coupé les notifs `mutedUntil` dans le futur). ⚠️ **Messages système** (`type:'system'`, `content` = JSON `{ k: clé i18n, by, ...params }`) émis via `createSystemMessage` (`messages.service`) sur événements groupe/éphémère (member_added/removed/left, group_created/renamed, ephemeral_on/off) : rendus en **bandeau centré** côté app (traduits via `system.*` selon la langue du lecteur), **exclus des non-lus** (`type != 'system'` dans le COUNT), exclus de la recherche, pas de push. Pas de message « chiffrement bout en bout » tant que l'E2E n'existe pas (V2).
message_reaction({ conversationId, messageId, reactions }) → état complet des réactions d'un message (voir l'endpoint)
message_edited({ conversationId, messageId, content, editedAt }) → texte modifié par son auteur
message_preview({ conversationId, messageId, linkPreview }) → aperçu Open Graph du premier lien, résolu **après** l'envoi (voir `src/lib/unfurl.ts`)
peer_typing({ conversationId, userId, typing })   → le correspondant écrit (masquage auto après 5 s côté app)
conversation_updated({ conversationId, message }) → **room `user:<id>`** (≠ `new_message` qui part dans `conv:<id>`) : met à jour la LISTE des conversations même si la conv n'a jamais été ouverte dans la session. Payload allégé volontairement (l'objet `message` complet embarque `sender` avec téléphone + token FCM). Émis à tous les membres, **émetteur inclus** (ses autres appareils)
presence_update({ userId, online, lastSeenAt })   → connexion/déconnexion d'un contact (gating `privacyLastSeen` appliqué serveur)
conversation_delivered({ conversationId, userId, at })  → un membre a REÇU (message parvenu sur son appareil). Émis (1) à la **connexion** de son socket pour toutes ses conversations — seul moment mesurable pour ce qui l'attendait hors ligne, la notification push ne repassant pas par le serveur — et (2) à l'**émission** d'un message, pour les destinataires déjà en ligne (sans quoi un message reçu pendant qu'on discute ne passerait jamais « reçu »). ⚠️ Basé sur `isUserOnline` (room personnelle) et non sur la room de conversation : « reçu » = arrivé sur l'appareil, pas « a la conversation ouverte »
conversation_read({ conversationId, userId, at })       → un membre a LU (déclenché par `POST /:id/read`)
members_added({ conversationId, memberIds })      → + push aux nouveaux membres
member_removed({ conversationId, userId })        → + push au membre expulsé
member_left({ conversationId, userId, newAdminId? })
added_to_group({ conversationId })
removed_from_group({ conversationId })            → redirige vers accueil côté app
group_updated({ conversationId, name })           → + push à tous les membres
friend_request_received({ from })                 → demande d'ami reçue (in-app si en ligne, sinon push) — notif locale côté app via `_layout`
friend_request_accepted({ by })                   → demande d'ami acceptée (in-app si en ligne, sinon push)
error({ message })
```

> **Notifications (social)** : `social/notify.service.ts` — push **uniquement si le destinataire est hors-ligne** (`isUserOnline`), sinon event socket → notif **in-app locale** (`expo-notifications`) côté `_layout` (pas de doublon push/in-app). Corps localisé selon la langue du destinataire (serveur) ou via i18n (client).

---

## Stories (Mois 3) — détail

Pipeline média : source (**galerie** expo-image-picker / **caméra in-app** expo-camera / **texte seul** fond coloré) → crop selon zoom (expo-image-manipulator, photos) → upload S3 via **presigned URL** (`POST /upload/presigned-url`) → `POST /stories` avec `mediaUrl`/`background` + `texts[]`. Médias jamais en BDD (URL CloudFront uniquement).

### Caméra in-app (`components/StoryCamera.tsx`)

- `CameraView` (expo-camera) plein écran, permissions caméra + micro (`useCameraPermissions`/`useMicrophonePermissions`, écran de repli + `Linking.openSettings()` si refus)
- **Geste capture** : `Gesture.Exclusive(pan, tap)` → **tap = photo** (`takePictureAsync`), **maintien = vidéo** via `Gesture.Pan().activateAfterLongPress(250)` (le Pan suit le doigt sans s'annuler au mouvement) ; **glisser vers le haut = verrouiller** (`LOCK_THRESHOLD`, cadenas animé) → l'enregistrement continue sans maintenir, bouton **Stop** dédié. Caméra en **`mode="video"` permanent** (pas de switch de mode → pas de race `recordAsync`) ; `recordAsync` max 30 s, garde `cameraReady` (`onCameraReady`)
- **Geste stabilisé** (`useMemo` + handlers via ref) : indispensable, sinon le re-render du chrono recrée le geste et coupe l'enregistrement en cours
- Anneau/bouton animé (reanimated) + barre de progression + chrono REC ; flash (off/on/auto, `enableTorch` en vidéo), switch avant/arrière
- **Pinch-to-zoom** : `Gesture.Pinch` (stabilisé `useMemo`) → prop `zoom` du `CameraView` (0 = 1x, 1 = max) ; remis à 0 au switch d'objectif
- **Zoom continu façon iOS** : un **facteur global** (`factor`) piloté par le pinch ; en dézoomant sous 1× on bascule sur l'**ultra grand angle** (`selectedLens`), en zoomant on revient — `getAvailableLensesAsync()` détecte l'ultra-wide (`/ultra/i`), re-fetch via effet sur `facing` (⚠️ **pas `onAvailableLensesChanged`** : son type tire les sources web cassées d'expo-camera → casse `tsc`). Crans 0.5×/1× (indicateur + sélecteur, pastille active = facteur live). **`camZoom`/`selectedLens` dérivés du facteur** (approx `UW_ZOOM_AT_1X` car expo-camera ne donne pas les vrais facteurs)
- **Objectif figé pendant l'enregistrement** (`lockedUltra`) : changer `selectedLens` pendant un `recordAsync` **coupe la vidéo** → on fige l'objectif au début et le zoom reste numérique (seul le `zoom` varie, pas l'objectif)
- Après capture : **photo** → éditeur direct ; **vidéo** → `VideoTrimmer` avant l'éditeur

### Rognage vidéo (`components/VideoTrimmer.tsx`)

- Toute vidéo (galerie **ou** caméra) passe par le trimmer avant l'éditeur (`create.tsx` : `trimUri`)
- Preview `expo-video` en **boucle sur la sélection** (`timeUpdate` → seek au début) ; durée via `isValidFile()` (ms)
- **Timeline à miniatures** (`expo-video-thumbnails`, ~8 vignettes) + **2 poignées** draggables (reanimated/gesture, gestes `useMemo` + callbacks stables, seek live, aucun `setState` pendant le drag → poignées non interrompues)
- Validation → **vrai découpage** `trim(uri, { startTime, endTime, enablePreciseTrimming: true })` (ms) → `outputPath` → `setMedia` ; raccourci si sélection = vidéo entière. ⚠️ **`enablePreciseTrimming: true` obligatoire** : sinon `-c copy` (défaut) ne coupe qu'aux keyframes → la **coupe de début dérive** (souvent jusqu'à 0)
- ⚠️ Ne **pas lire de `ref` (`.current`) dans un worklet** de geste (warning Worklets + valeur figée) : calculer les temps depuis les shared values (`startX`/`endX`)
- Éditeur : **preview vidéo** (`VideoView`, boucle) au lieu de l'icône statique ; zoom/pan spatial neutralisé pour la vidéo (garde `isTextOnly`)
- **Backend inchangé** : le fichier trimmé s'upload comme n'importe quelle vidéo

### Création (`app/story/create.tsx`)

- Photo **ou vidéo** ; zoom/pan sur l'image (double-tap = reset) ; le crop est appliqué à la publication selon le zoom/pan
- **Textes multiples**, chacun déplaçable / redimensionnable / rotatable :
  - pinch + rotation **remontés au conteneur plein écran**, ciblant le « texte actif » → le 2ᵉ doigt peut se poser **n'importe où** (le 1ᵉ doigt sur le texte le sélectionne via un flag `owns`)
  - cleanup via `onFinalize` (pas `onEnd`) car le pan peut ne jamais s'« activer »
  - hitbox **découplé du visuel** (scale/rotation sur une vue interne) → la zone tactile ne grossit pas avec le texte
  - translation divisée par le zoom (suivi du doigt au 1:1)
  - **poubelle** d'aimantation basée sur la **position du doigt** (pas du texte)
  - **guides d'alignement verts** (centre X/Y) avec aimantation, et aimantation **rotation** aux multiples de 45°
- **Styles de texte** (module partagé `lib/storyText.ts`) : couleur (palette), fond `none` / `translucent` / `solid` (contraste auto noir/blanc), **gras / italique / souligné**
- **Stickers emojis** : bouton emoji (header) → `EmojiPicker` (bottom sheet **à onglets par catégorie** + **glisser-pour-fermer** via Gesture.Pan/reanimated ; emojis groupés dans `STICKER_CATEGORIES` de `lib/storyStickers.ts`) → sticker = `TextItem` avec `kind:'sticker'`, rendu **emoji nu** (`STICKER_FONT_SIZE`, pas de bulle ni édition) ; réutilise le **même système de gestes** (drag/pinch/rotate/poubelle) que les textes. `kind` en colonne `Json` → aucune migration
- Éditeur « live » : rendu direct (pas de cadre de formulaire), curseur seul (pas de placeholder), `scrollEnabled={false}` + padding (évite le retour à la ligne en italique), boutons OK + A(fond) + B/I/U

### Viewer (`app/story/[id].tsx`)

- Ordre **chronologique** (plus ancienne → plus récente, la plus récente en dernier)
- Barre de progression + navigation **tap** gauche/droite
- **Maintien appuyé = pause** (gèle la barre, reprend au temps restant au relâcher ; `pausedRef` synchrone)
- Pinch/rotation pour zoomer, double-tap reset
- **Vidéo** (expo-video) : durée de progression = durée réelle de la vidéo, mute/unmute, lecture auto une fois bufferisée
- **Gating média** : texte + timer ne démarrent qu'une fois l'image chargée (`onLoadEnd`) / la vidéo prête (`statusChange`) → pas de texte/timer avant l'affichage ; `loadedIds` (cache des stories vues, retour instantané) + `Image.prefetch`
- **Loading state** : tant que `!mediaReady`, overlay **`BlurView`** (expo-blur ⚠️ module natif, rebuild) + `ActivityIndicator` → masque/floute l'image **encore figée sur la story précédente** (RN garde l'ancienne image jusqu'au chargement de la nouvelle). Écran de chargement plein (spinner) pendant le fetch initial (`!stories.length`)
- Temps depuis publication (min si < 1h, sinon h) ; suppression (propriétaire)
- **Swipe-down pour fermer** : `Gesture.Pan` (1 doigt, `activeOffsetY(16)`, `failOffsetX`) enveloppant tout le contenu ; suit le doigt (translateY + scale + coins arrondis), ferme si seuil/vélocité dépassés, sinon `withSpring(0)` ; désactivé si zoom / drawer / clavier ouverts ; pause pendant le geste
- **« Vu par »** : vue enregistrée (`POST /stories/:id/view`) dès que le média est affiché (1× par story via `viewedSentRef`, jamais sur ses propres stories) ; côté propriétaire, **drawer sombre repliable** toujours visible en bas (poignée + avatars empilés des 3 derniers viewers + compteur), **draggable** (Gesture.Pan + reanimated, aimantation ouvert/fermé selon position/vélocité) ou tap pour ouvrir → liste détaillée des viewers (`GET /stories/:id/views`, owner-only, pré-fetch au chargement). Ouverture = pause de la story + backdrop assombrissant cliquable pour fermer
- **Répondre à une story** (non-propriétaire) : barre en bas — **champ texte sur fond noir** (`bg-black/60`) avec smiley intégré ouvrant un **popover flottant de réactions** (`QUICK_EMOJIS`, animé `FadeInDown/FadeOutDown`, tap = envoi + fermeture, pause de la story tant qu'ouvert) ; bouton d'envoi vert qui apparaît dès qu'on tape. `KeyboardAvoidingView`, pause de la story au focus ; un tap navigation ferme d'abord le popover. Envoi = `POST /conversations/direct` `{ targetUserId }` puis `socket.emit('send_message', { type: 'story_reply', storyId, storyMediaUrl })` ; feedback « Envoyé ✓ », pas de navigation (on reste dans la story). Affichage **contextualisé** dans `chat/[id].tsx` : icône `↩` + libellé « a répondu / a **réagi** à votre story » (nuance selon emoji-only), **vignette verticale** `storyMediaUrl` (50×84), puis bulle de texte — ou **réaction emoji en grand hors bulle** (~50px) détectée via `isEmojiOnly` (`\p{Extended_Pictographic}`). Bulles alignées au contenu (`items-end/start` sur le conteneur, plus de bulle pleine largeur)

### StoriesBar (`components/StoriesBar.tsx`)

- Bouton **+** (coin de l'avatar) pour ajouter une story supplémentaire quand on en a déjà une — le tap sur l'avatar reste « visionner ma story »
- Rafraîchissement : `useFocusEffect` (au focus) **+** `forwardRef`/`useImperativeHandle` exposant `refresh()` → le **pull-to-refresh** de l'écran Messages (`(tabs)/index.tsx`) recharge aussi les stories (`storiesRef.current?.refresh()`)
- UI : `StoryRing` (anneau **dégradé bleu nexa** `expo-linear-gradient` si non vu / **gris** si vu) + `Avatar` (photo de profil ou initiale) ; **« Ma story »** affiche **ta photo de profil** (via `/users/me`) + badge `+` nexa toujours visible. Tout harmonisé sur le bleu nexa
- **Anneau « non vu »** : bordure `border-nexa` (bleu) si le groupe a au moins une story non vue, sinon `border-gray-300` (basé sur `hasUnviewed` renvoyé par `GET /stories`)

### Données / backend

- `texts` stocké en colonne **`Json`** → champs libres persistés tels quels (`content, normX, normY, scale, rotation, color, bgMode, bold, italic, underline`), **aucune validation backend** (le type étroit du service est cosmétique)
- Détection vidéo côté viewer via l'**extension de l'URL** (`.mp4` garanti par `upload.controller.ts`)
- **`StoryView`** (modèle Prisma, unique `[storyId, viewerId]`, cascade) : `recordStoryView` upsert idempotent (pas d'auto-vue, **refus si non-ami** → 403), `getStoryViewers` owner-only ; `getActiveStories(viewerId)` tague `viewed`/`hasUnviewed`, `getMyStories` expose `viewCount` via `_count`
- **Audience = amis uniquement** : `getActiveStories` filtre sur `getFriendIds(viewerId)` (`social/relation.service`) → `userId: { in: friendIds }`, court-circuit `[]` si aucun ami. Le blocage supprimant l'amitié, un utilisateur bloqué sort mécaniquement de la liste (pas de filtre blocage supplémentaire). Ses **propres** stories ne passent pas par cette route (`/stories/me` + filtre client dans `StoriesBar`). Aucune migration : c'est un filtre de requête, pas un champ.

### Story fond coloré (texte seul) ✅

- Éditeur (`create.tsx`) : écran de choix à 2 boutons (**Photo/vidéo** ou **Story texte**) ; en mode texte, `bgId` (preset) + fond `StoryBackground` au lieu de l'image, **zoom/pan image neutralisés** via shared value `isTextOnly` (le pinch/rotation ne pilotent que le texte actif), sélecteur de fond (pastilles en bas). Publication **sans upload S3** : `POST /stories { background, texts }` (transform identité `s=1, tx=0, ty=0`).
- Presets dans `lib/storyBackgrounds.ts` (id → `colors[]`, 1 = uni / 2+ = dégradé) ; rendu partagé `components/StoryBackground.tsx` (`View` ou `expo-linear-gradient`). **Stocké = l'id du preset** → aucune migration pour ajouter un fond.
- Viewer + StoriesBar : si pas de `mediaUrl`, rendent `StoryBackground` ; le viewer démarre texte+timer **immédiatement** (pas de gating média).

### Reste à faire (features stories) 🔜

- Idées : mentions `@`, audience fine (amis proches / masquer à certains), highlights/archive au-delà de 24h
- ✅ Faits depuis : stickers/emojis, swipe-down pour fermer, audience « amis uniquement »

---

## Chat enrichi (Phases A→E) ✅ — détail

Chantier livré par phases, sur `app/chat/[id].tsx` + `app/chat/details.tsx` + `app/chat/media.tsx`.
Principe transverse : **ce qui est cosmétique et personnel reste local** (SecureStore), **ce qui est partagé ou modéré passe par le backend**.

### Phase A — En-tête de conversation + personnalisation locale

- Header : avatar (`UserAvatar`) + nom + boutons d'appel **grisés selon `canCall`** (re-vérifié serveur via `GET /users/:id/profile`, appels réels = Mois 4) + menu « … ». Tap sur l'avatar/le nom → `chat/details.tsx` (conv directe uniquement).
- **`chat/details.tsx`** : profil gated, actions rapides, personnalisation, sections médias/épinglés/favoris, gestion (effacer / bloquer / signaler).
- **Réglages locaux** (`lib/storage.ts`, maps `{ conversationId → … }`, jamais partagés — la personne en face ne les voit pas) :
  - **fond de conversation** (`lib/chatWallpapers.ts` + `ChatBackground`) : défaut = asset nexa qui **suit le thème** de l'appareil ; presets `nexa_light`/`nexa_dark` = variante forcée ; presets couleur/dégradé ; ou **photo perso** (copiée dans `documentDirectory` — l'uri du picker vit en cache, donc purgeable)
  - **surnom** du contact (prime sur le vrai nom, affiché en sous-titre dans les détails)
  - **couleur des bulles « moi »** (`lib/bubbleColors.ts`, défaut = bleu nexa)
  - **« Effacer la conversation »** = horodatage local ; les messages antérieurs sont **filtrés côté app** (aucun appel backend, n'affecte pas l'autre)
- Bulles : `BUBBLE_SHADOW` (ombre légère) pour rester lisibles sur n'importe quel fond.

### Phase B — Présence temps réel + indicateur de frappe

- **Sous-titre dynamique** par priorité : `frappe` > `en ligne` > `vu le JJ/MM HH:MM` > rien ; bleu nexa pour frappe/en ligne, gris sinon. **Point de statut** sur l'avatar (vert/gris).
- Émission de `typing` à la 1ʳᵉ frappe puis **auto-stop après 3 s** sans saisie (+ stop à l'envoi et au démontage) ; côté réception, `peer_typing` avec **masquage auto après 5 s**.
- `presence_update` filtré sur `otherUserIdRef` (une ref, pas un state — l'écouteur socket est monté une fois). `lastSeenAt` mis à jour serveur à la déconnexion, **gating `privacyLastSeen` appliqué serveur**.

### Phase C — Mute / éphémères / épinglés / favoris

- **Mute** (`PATCH /:id/mute`) : 8 h / 1 semaine / toujours (sentinelle `MUTE_FOREVER` = an 2999) / réactiver. Par membre (`ConversationMember.mutedUntil`) → **le backend saute le push** si muté.
- **Éphémères** (`PATCH /:id/ephemeral`) : 24 h / 7 j / 30 j / off, **au niveau de la conversation** (`Conversation.ephemeralDuration`, en secondes). À l'envoi, le socket calcule `expiresAt` ; un `setInterval` (5 min) purge les expirés ; toutes les requêtes médias filtrent sur `expiresAt`.
- **Épinglés** (`PinnedMessage`) = **niveau conversation, visibles par tous**. **Favoris** (`StarredMessage`) = **personnels**. Appui long sur une bulle → menu épingler/favori ; `GET /:id/flags` fournit les ids pour décorer les bulles (icônes 📌 / ⭐).
- Depuis les détails, tap sur un épinglé/favori → `lib/chatNav.ts` (relais one-shot) → retour au chat, `scrollToIndex` + **surlignage jaune 2,5 s**. Si le message n'est pas dans la page chargée, l'action est ignorée (pas de fetch remontant).

### Phase D — Médias dans le chat

- **Panneau de pièces jointes animé** : le « + » **pivote à 45°** (reanimated `withTiming`) et révèle 3 pastilles en `FadeInDown` décalé — Galerie, Document, GIF.
- Types : **photo/vidéo** (expo-image-picker), **document** (expo-document-picker), **GIF** (Giphy), **message vocal** (expo-audio : le bouton micro remplace l'envoi quand le champ est vide ; barre d'enregistrement avec chrono, corbeille pour annuler, envoi ; < 1 s = ignoré).
- Pipeline identique aux stories : `lib/upload.ts` → presigned S3 (`folder: 'chat'`) → URL CloudFront → `socket.emit('send_message', { …payload })`. **Jamais de binaire en BDD.**
- Rendu (`MessageMedia`) : image/gif/vidéo **en grand hors bulle** (+ légende dessous), audio/document **en carte dans une bulle blanche**. Tap image/vidéo → `MediaViewer` plein écran. Les URLs dans le texte sont **soulignées et cliquables** (`firstUrl`).
- **Galerie par catégorie** (`chat/media.tsx`) depuis les détails : grille 3 colonnes (media/gifs) ou liste (documents/audio/links), pagination curseur 30/page, **téléchargement groupé** dans le stockage de l'app.
- Détection de lien côté serveur (`hasLink`) → alimente la catégorie « Liens » sans re-scanner les textes.

### Phase E — Refonte visuelle (30-31 juil. 2026)

- **Zone de saisie flottante en verre** (`GlassSurface`) : le fond de conversation transparaît. ⚠️ Le `BlurView` n'est appliqué **que sur iOS** (rendu natif) ; sur Android on pose une surface légèrement translucide — `expo-blur` y est bien plus coûteux et la barre est redessinée à chaque frappe.
- **Clavier synchronisé** : `KeyboardAvoidingView` de **react-native-keyboard-controller** (position mesurée nativement image par image). Celui de React Native décale d'un bloc, et le piloter depuis l'événement JS laisse un décalage visible.
- **Flou progressif en haut du fil** (`ProgressiveBlur`) — retiré en bas, où la barre de saisie en verre joue déjà ce rôle. Technique reprise de `beautiful-expo` (MIT) et **réécrite** : le paquet d'origine exige Reanimated 4.5 / SDK 57, le projet est en SDK 54.
- **Débordement de liste FIXE sous la barre de saisie** (`COMPOSER_OVERLAP = 240`), dimensionné sur le pire cas (champ 5 lignes + vignettes) : c'est lui qui fait passer les messages *derrière* le verre au défilement. ⚠️ Volontairement **pas** une hauteur mesurée — la barre change de taille à chaque frappe et recalculer la mise en page de la liste à ce rythme la fait saccader.
- **Bulles** : « moi » en **dégradé** (`bubbleGradient` dérivé de la couleur d'accent choisie), **heure** dans la bulle, header en carte flottante, animation d'entrée `MessageEnter` (⚠️ ressort sur la translation, jamais sur l'échelle — cf. règle « pas de rebond »).
- **Bulles optimistes** (6 août 2026) : tout envoi (album, document, vocal, texte) pose d'abord un **brouillon local** (`pendingLocal`, `makeDraft`/`pushDraft`/`linkDraft`/`dropDraft`) avec le fichier **du téléphone** comme source, puis la vraie bulle prend sa place. L'écho serveur est reconnu par l'URL S3 obtenue au téléversement (`pendingUploadUrl`) — pour le texte, faute d'URL, par `contenu + expéditeur`. ⚠️ Au remplacement on **garde l'uri locale** comme source affichée : basculer sur l'URL S3 ferait recharger l'image depuis le réseau, donc clignoter. Remplacement **sur place**, jamais « retirer puis ajouter à la fin » (l'album serait réordonné). Voile sombre (`SendingVeil`) sur les seules images/albums, dont le média n'est pas encore disponible ; documents et vocaux sont déjà utilisables localement (un vocal est **écoutable pendant son téléversement**).
- **État d'acheminement** : `SendStatus` + `StatusIcon` contre l'heure, sur **ses propres messages** uniquement — `sending` (horloge) → `sent` (une coche). Échelle prévue pour s'allonger : `delivered` (deux coches) et `read` (deux coches bleues) quand le serveur les fournira, d'où un statut **nommé** plutôt qu'un booléen. ⚠️ **Pas d'état d'échec** : socket.io met les envois en tampon et les rejoue à la reconnexion, donc annoncer un échec serait faux et un bouton « réessayer » enverrait deux copies. Le seul cas de perte réelle (app tuée hors ligne) demande une file d'attente **persistée**, pas un indicateur.
- **Albums** : plusieurs médias envoyés d'un même geste partagent un `batchId` et s'affichent en **une** ligne (`MediaGrid` → `AlbumViewer`). Plafond `MAX_PENDING = 10` (chaque pièce part en upload S3 depuis le mobile). Avant envoi, les médias choisis attendent dans `PendingMediaBar` (retrait à l'unité).
- **Vocaux** : `VoiceRecorderBar` (chrono, annulation, envoi ; < 1 s ignoré) avec tracé d'onde live dérivé du `metering` — plage resserrée −50→0 dB et courbe accentuée, sinon le tracé paraît plat. À la lecture (`AudioMessage`), onde **seekable au doigt** + **multiplicateur de vitesse** (1×/1,5×/2×).
- **Documents** : `DocumentViewer` in-app (WebView). Formats bureautiques non garantis → écran de repli avec téléchargement. ⚠️ Aucun service de conversion tiers (transmettre l'URL d'un document privé à Google Docs Viewer reviendrait à le lui faire télécharger).
- ⚠️ **Session audio** : toujours repasser par `enterPlaybackMode()` (`lib/audioMode.ts`) après un enregistrement, sinon iOS garde `PlayAndRecord` et **tout** ce qui est lu ensuite sort par l'écouteur téléphonique.

### Lot 1 — citations, réactions, menu contextuel (30 août 2026)

Refonte du chat « façon WhatsApp » menée **par lots incrémentaux**, pas en réécriture : le fil porte une quarantaine de corrections non évidentes (bulles optimistes, albums, accusés en arrière-plan, fenêtre centrée) qu'un redémarrage à zéro reperdrait une par une. ⚠️ La **liste inversée** et la **pagination à fenêtre centrée** sont conservées — ce sont les corrections des 7 et 8 août, pas des scories.

- Migration `message_reply_reactions` : `Message.replyToId` (auto-relation, **`onDelete: SetNull`** — en cascade, supprimer un message effacerait toutes les réponses qu'il a reçues), `Message.forwarded`, modèle `MessageReaction` (`@@unique([messageId, userId])`).
- Tout passe par **`MESSAGE_SELECT`**, point de lecture unique : historique, `around`, pagination en héritent sans ligne supplémentaire.
- ⚠️ **`sanitizeQuotes`** : `liveMessages` filtre la page, **pas la relation** — un éphémère expiré restait lisible dans l'aperçu de la citation. Le serveur vide l'extrait et pose `expired`.
- ⚠️ Le socket **vérifie que le message cité appartient à la conversation** : l'identifiant vient du client, et sans ce contrôle on citerait un message d'une conversation dont on n'est pas membre. Une citation invalide est **ignorée**, pas refusée — le message part quand même, perdre le texte de l'utilisateur serait pire.
- ⚠️ La **bulle mesure sa propre place** (ref + `measureInWindow`) pour ancrer le menu : sous la nouvelle architecture (Fabric), `event.target` n'est pas un nœud mesurable.
- ⚠️ Sur un **album**, les réactions sont **agrégées sur la ligne** (une bulle = plusieurs messages) ; le retrait vise le message qui porte réellement ma réaction. La **citation** n'est portée que par le **premier** média d'un envoi.
- ⚠️ Le **transfert** ne reprend pas la citation : le message cité n'existe pas dans la conversation d'arrivée, et l'y afficher exposerait un extrait d'une conversation dont le destinataire n'est pas membre.
- Glisser vers la droite = répondre : `activeOffsetX` positif seul + `failOffsetY` serré (sinon le geste prend la main sur le défilement), nettoyage dans **`onFinalize`** et pas seulement `onEnd` — un geste annulé ne passe jamais par `onEnd`.

### Position dans le fil — `lib/threadScroll.ts` (31 août 2026)

Le défilement était piloté par **9 refs** lues et écrites depuis **16 endroits**. Chacune avait été ajoutée pour éteindre un symptôme et se justifiait isolément ; ensemble, **personne ne possédait le défilement** à un instant donné. Symptôme qui l'a révélé : à l'ouverture sur le repère, le fil se calait dessus **puis redescendait aussitôt en bas** — `onScroll` entretenait « suis-je en bas ? » pendant le calage, en réaction à notre propre défilement.

- **4 états, un seul actif** : `opening` (calage, fil masqué) → `anchored` (position tenue, **rien** ne déplace le fil) / `following` (collé au bas) ; `jumping` pour un saut ciblé.
- ⚠️ L'état de **sortie** d'`opening` dépend de ce qu'on visait : une ligne → `anchored`, le bas → `following`. C'est le correctif.
- ⚠️ Pendant `opening` et `jumping`, `onScroll` **ne déduit rien** : lire un défilement qu'on a soi-même provoqué pour en tirer une intention est la faute d'origine.
- Les handlers de la liste ne décident plus, ils **demandent** ; l'état accepte ou refuse.
- Disparaît au passage la « fenêtre de suivi » de 2,5 s, remplacée par une transition explicite : envoyer un message est une **intention**, pas un intervalle de temps.
- ⚠️ **Ne pas remettre de `Pressable` sous le `GestureDetector` d'une bulle** : le responder JS de React Native est court-circuité par les gestes natifs de RNGH, et `onLongPress` ne se déclenche plus jamais (le swipe, lui, continue — symptôme trompeur). Appui long et glissement vivent tous deux dans RNGH, composés en `Race`.

### Aperçu de liens — `src/lib/unfurl.ts` (1er sept. 2026)

- ⚠️ **Côté serveur par choix de confidentialité** : le faire depuis l'app révélerait l'IP de **chaque destinataire** au site visé — un lien vers un serveur qu'on contrôle suffirait à savoir qui a ouvert la conversation, et quand. **À documenter dans la politique de confidentialité.**
- Attaché au **message** (relation dans `MESSAGE_SELECT`) : aucune requête côté app, et un lien partagé dans un groupe n'est visité qu'**une fois au total** (modèle `LinkPreview` indexé sur l'URL = cache ; les échecs sont mémorisés aussi, TTL 6 h).
- Résolu **après** l'envoi et sans l'attendre (event `message_preview`) : visiter un site prend jusqu'à 5 s.
- ⚠️ **SSRF** — le risque principal (URL fournie par l'utilisateur, serveur dans un VPC AWS). Le nom est résolu **avant** toute requête et **toutes** ses adresses vérifiées ; les redirections sont **manuelles**, chaque saut repassant le contrôle ; IPv4 **et** IPv6, formes mappées `::ffff:` comprises ; lecture bornée à 256 Ko ; http(s) seulement. 10 tentatives de contournement testées et bloquées.
- ⏳ Reste au Mois 5 : la fenêtre **TOCTOU** entre la vérification DNS et la connexion (parade = agent HTTP à `lookup` personnalisé).

### Points d'attention

- `GIPHY_API_KEY` est dans `lib/config.ts` ; sans clé (ou avec le placeholder), `GiphyPicker` affiche un écran « clé absente » au lieu de planter. ⚠️ **clé en dur à sortir avant la prod** (voir Sécurité).
- Les réglages locaux sont en **SecureStore** : ils ne survivent pas à une désinstallation et ne se synchronisent pas entre appareils. Assumé pour de la cosmétique.
- **FlashList v2, NON inversée** (2 sept. 2026 — remplace la liste inversée du 7 août). L'inversion contournait les hauteurs **estimées** de FlatList, cause racine de toute la « saison des sauts » ; FlashList **mesure** ses cellules, son `maintainVisibleContentPosition` (actif par défaut) absorbe les insertions d'historique en tête, `startRenderingFromBottom` rend depuis le bas. Ordre **chronologique** : ancien à l'index 0, récent en dernier, bas = **fin** du contenu (`scrollToEnd`). ⚠️ **Recyclage** : une cellule recyclée garde son état interne en changeant de message → **clés d'identité** obligatoires sur tout composant à état dans une bulle (`MessageText`, `MessageMedia`, `AudioMessage`), `MessageEnter` re-décide son animation sur changement de `messageId`, `getItemType` par type de bulle. ⚠️ `autoscrollToBottomThreshold` volontairement **non activé** : le suivi du bas appartient à `threadScroll` — deux pilotes du même mouvement se contredisent. Lignes rendues par **`ChatRow` (React.memo)**, comparateur manuel : messages par référence, primitives par valeur, **handlers ignorés donc obligatoirement stables**.
- **Clavier = TRANSLATION, jamais un redimensionnement** (`useReanimatedKeyboardAnimation`, bloc liste+composeur translaté sur le thread UI, zone sûre compensée au prorata de `progress`). ⚠️ Le `KeyboardAvoidingView` (padding) redimensionnait la liste à chaque frame et FlashList recalculait sa mise en page — coût ∝ nombre de lignes, 60×/s. Ne pas y revenir.
- **Vocaux** : la bulle monte une **coquille inerte** ; le lecteur natif (`useAudioPlayer`) n'est créé qu'au premier appui et reste ensuite monté. Un lecteur par bulle montée était une source mesurable de lag.
- **Historique paginé vers le haut** ✅ (2 août 2026) : `onStartReached` → `GET /:id/messages?cursor=<id du plus ancien affiché>` (30/page), page incomplète = début de la conversation (`hasOlderRef`). ⚠️ `maintainVisibleContentPosition={{ minIndexForVisible: 1 }}` est indispensable : insérer en tête pousse tout le contenu vers le bas, et le fil sauterait d'une page entière sous le doigt. Les messages rapatriés sont marqués « déjà vus » (`seenIdsRef`) avant d'être posés, sinon toute la page jouerait l'animation d'entrée. ⏳ Reste à faire pour la recherche (item B2 du `todo`) : charger l'historique **autour d'un message** précis, pas seulement page par page depuis le bas.

---

## Liste de conversations (onglet Discussion) ✅

Migration `conversation_list` : `ConversationMember.lastReadAt` / `pinnedAt` / `favoritedAt` (tout est **par membre**, donc personnel — épingler une conv ne l'épingle pas chez l'autre).

- **Tri** : épinglées d'abord (la plus récemment épinglée en tête), puis par date du **dernier message**. Avant, `getUserConversations` triait par `conversation.createdAt` — la date de *création de la conversation*, jamais mise à jour. Le tri est fait **en mémoire** : il combine une relation (dernier message) et des colonnes du membre, ce que Prisma ne sait pas exprimer en un `orderBy`. La même fonction `sortConversations` est rejouée côté client après chaque event socket.
- **Non-lus** : `lastReadAt` par membre + `COUNT` des messages postérieurs dont je ne suis pas l'auteur. Choisi contre un compteur incrémental, qui dérive dès qu'un event est manqué (crash, offline, éphémère purgé) sans moyen de se resynchroniser. Coût : un COUNT par conversation à chaque chargement de liste (en parallèle) — à surveiller si le nombre de conversations grossit.
- **Marquage lu** : `POST /:id/read` à l'ouverture du chat **et** à chaque message reçu pendant qu'on y est (sinon il ressortirait non lu au retour sur la liste).
- **Temps réel** : event `conversation_updated` sur la room `user:<id>` (voir section Socket.io). L'écran écoute **cet event et pas `new_message`** — écouter les deux double-compterait les non-lus des conversations ouvertes.
- **Filtres** : Toutes / Non lues (avec compteur) / Favoris / Groupes, purement côté client sur la liste déjà chargée. La StoriesBar et la bannière de demandes ne s'affichent que sur « Toutes ». ⏳ **Reste à faire** : filtres personnalisés (bouton « + » façon WhatsApp), volontairement hors périmètre.
- **Actions** : appui long sur une conversation → `BottomSheet` (épingler, favori, archiver, marquer comme lu). Mise à jour **optimiste** puis appel serveur ; en cas d'échec, refetch — le serveur fait foi.
- **Gestes de glissement** (`components/ConversationSwipe.tsx`, `ReanimatedSwipeable` de RNGH) : vers la **droite** = Non lu + Épingler ; vers la **gauche** = Archiver + « … » (rouvre le même `BottomSheet`). ⚠️ Les gestes **doublent** l'appui long, ils ne le remplacent pas : un geste ne s'annonce pas de lui-même. La ligne elle-même (`components/ConversationRow.tsx`, partagée avec l'écran des archives) doit garder un **fond opaque**, sinon les actions se voient au travers.
- **Archivage** (migration `conversation_archive` : `ConversationMember.archivedAt` + `manualUnread`) : réglage **par membre**, comme l'épinglage. Décisions prises le 5 août 2026 :
  - un nouveau message **ne désarchive pas** (comportement WhatsApp) — sinon ranger une conversation active n'aurait aucun effet durable ; son compteur reste visible sur l'entrée « Archivées » ;
  - les archives sont **exclues des pastilles** (onglet + icône, `countUnreadMessages` filtre sur `archivedAt IS NULL`) : sinon la pastille afficherait un nombre que rien ne fait retomber dans la liste visible ;
  - **archiver retire l'épinglage** (une conversation rangée n'a rien à faire en tête de liste) ;
  - écran dédié `app/archived.tsx`, atteint depuis l'entrée « Archivées » en tête de liste (visible seulement sur le filtre « Toutes »).
- **« Non lu » manuel** (`manualUnread`) : un simple recul de `lastReadAt` ne suffirait pas — le compteur ignore mes propres messages, donc une conversation dont le dernier message est de moi resterait à zéro. D'où un drapeau distinct, rendu par une **pastille sans nombre**. Levé par toute lecture.
- ⚠️ `getUserConversations` renvoyait `members: { include: { user: true } }`, donc **le numéro de téléphone et le token FCM de tous les participants**. Remplacé par un `select` ciblé (`id`, `name`, `photoUrl`) — ne pas réintroduire `user: true` ici.

## Navigation : onglets, badges, FAB ✅

- **Onglet « Contacts »** (`tabs.contacts`, SF Symbol `person.2.fill`). ⚠️ La **route reste `search`** (`app/(tabs)/search.tsx`) — seul le libellé a changé ; ne pas renommer le fichier sans mettre à jour `NativeTabs.Trigger name="search"` et tous les `router.navigate('/(tabs)/search')`.
- **Badge natif de demandes d'ami** : `<Badge>` d'`expo-router/unstable-native-tabs`. ⚠️ Le « petit point » sans texte est documenté **Android uniquement** ; sur iOS le badge s'affiche comme une **chaîne** → on passe le **nombre** (`99+` au-delà). `hidden` quand le compteur est à 0.
- **Badge de messages non lus sur l'onglet Discussion** : `lib/unreadMessages.ts`, même mécanique de store externe. Garde le détail **par conversation** (pas un simple total) → une conversation ouverte se remet à zéro sans connaître son compte précédent. Alimenté par le rechargement de la liste (le serveur fait foi), l'event `conversation_updated`, l'ouverture d'un chat et « marquer comme lu ». La **conversation affichée à l'écran est exclue** du comptage (`setActiveConversation`), sinon recevoir un message pendant qu'on le lit ferait clignoter la pastille. Le badge compte des **messages** (somme), là où le filtre « Non lues » compte des **conversations**.
  - **Pastille de l'icône de l'app** : synchronisée depuis ce même store (`setBadgeCountAsync` à chaque recalcul, y compris quand le total n'a pas bougé — elle a pu être posée par une notification reçue app fermée alors que la conversation a été lue ailleurs). App fermée, c'est le **serveur** qui la met à jour : `countUnreadMessages` (`src/lib/unread.ts`, une seule requête SQL) alimente le champ `badge` du push, **par destinataire**. ⚠️ `lib/unread.ts` et non `messages.service` : ce dernier importe `lib/socket`, qui devrait alors l'importer en retour (cycle). Un Context ne conviendrait pas : le badge est rendu par `(tabs)/_layout`, qui serait aussi le fournisseur — un composant ne peut pas consommer le Context qu'il fournit. Alimenté par (1) `refreshPendingFriendRequests()` au démarrage dans `app/_layout.tsx`, (2) `incrementPendingFriendRequests()` sur socket `friend_request_received` (optimiste, sans aller-retour), (3) `setPendingFriendRequests(r.length)` dans le `load()` de `FriendsPanel` — ce `load()` étant rejoué au focus **et** après chaque accept/refuse, c'est le point unique de resynchronisation.
- **FAB « + »** en bas à droite de la page Discussion → `BottomSheet` (hauteur auto) à 3 actions : nouvelle conversation (`chat/new`), nouveau groupe (`group/new`), ajouter un contact (→ onglet Contacts, **segment Répertoire** via `requestContactsSegment('directory')`). Il **remplace** l'ancienne icône « nouveau groupe » du header, devenue redondante.

## Localisation (Mois 3) 🔄

Chantier en 3 phases, périmètre validé le 5 août 2026 (le client veut les trois).

### Phase 1 — La ville au profil ✅

- Migration `profile_location` : `Profile.city` / `country` / `locationUpdatedAt`.
- ⚠️ On stocke la **ville, pas les coordonnées** : c'est tout ce que l'affichage demande, et une fuite ne désigne alors pas un domicile.
- **Géocodage inverse sur l'appareil** (`expo-location`, services natifs iOS/Android) → **aucune clé Google** pour cette phase, et les coordonnées ne quittent jamais le téléphone.
- Relevé **manuel** (ligne « Ma ville » dans le profil), jamais en tâche de fond — c'est aussi ce qui rend la permission facile à justifier.
- `GET /users/:id/profile` renvoie `location` sous **double condition** : `locationEnabled` **et** `privacyLocation` satisfait. Désactiver le partage masque la ville quel que soit le réglage de visibilité.
- `lib/location.ts` : `detectAndSaveCity` (distingue `denied` / `canAskAgain` → renvoi vers les réglages), `clearCity`, `formatLocation`, `openInMaps`.

### Phase 2 — Envoyer une position dans une conversation ✅

- Migration `message_location` : `Message.latitude` / `longitude`, en **colonnes** et non dans `content` (qui porte l'adresse lisible) — elles restent exploitables telles quelles pour la phase 3.
- Socket : `type: 'location'` ; les coordonnées sont **ignorées** sur tout autre type de message.
- `components/LocationPicker.tsx` : `LocationPicker` (choix d'un point) + `LocationBubble` (aperçu figé). Le repère est **fixe au centre et c'est la carte qui bouge dessous** — viser un marqueur au doigt est pénible.
  - ⚠️ Le repère doit se superposer à la **carte seule** : posé sur le conteneur entier (carte + panneau), il se retrouvait centré ~60 px trop bas et désignait un autre point que celui envoyé. `PIN_LIFT` remonte l'icône pour que sa **pointe** tombe sur le centre.
- Tap sur l'aperçu → application de cartes du téléphone (`openInMaps`, schéma d'URL par plateforme).

### Phase 3 — Position en direct 🔄 (premier plan ✅, arrière-plan à revoir)

- Modèle **`LiveLocation`** (migration `live_location`) — remplace `LocationShared`, qui n'était utilisé nulle part et n'avait pas d'expiration. Rattaché à une **conversation** : membres, blocage et permissions y sont déjà vérifiés, et les groupes fonctionnent sans code supplémentaire. Une ligne par (conversation, utilisateur), position écrasée à chaque relevé.
- Garde-fous serveur : durée **bornée** (1 min → 8 h) ; un relevé **ne crée jamais** de partage (un appareil qui n'a pas vu l'arrêt ne peut pas le relancer) ; `expiresAt` fait autorité même si l'appareil se tait ; purge toutes les 5 min.
- **Deux canaux** : socket (`live_location_start`/`update`/`stop`) quand l'app est à l'écran, et **`POST /conversations/:id/live-location`** pour l'arrière-plan. ⚠️ Ce doublon est nécessaire : l'app **ferme son socket** en arrière-plan (pour recevoir les notifications), or c'est là que la tâche de localisation s'exécute. Un **410** signifie « partage terminé » → l'appareil cesse d'émettre.
- App : `lib/liveLocation.ts` (tâche `TaskManager` + repli `watchPositionAsync`), écran `chat/live.tsx`, `components/LiveLocationDrawer.tsx`.
  - ⚠️ La liste des partages est **persistée en SecureStore** : le système réveille la tâche dans un contexte JS qui peut être neuf, où la mémoire de l'app n'existe plus.
  - ⚠️ **Toujours garder le repli premier plan** : `startLocationUpdatesAsync` échoue si la permission « Toujours » est refusée. S'en remettre à elle seule rendait le partage muet après sa position initiale, sans le moindre signe.
  - **Fraîcheur affichée** (drawer + marqueur estompé au-delà de 2 min) : elle reste utile même une fois l'arrière-plan au point — réseau coupé, batterie vide, app fermée par l'utilisateur donnent le même symptôme.
- ⏳ **Arrière-plan à reprendre** (voir `todo`) : `UIBackgroundModes: location` manquait à l'`Info.plist` — `expo run:ios` **ne refait pas le prebuild** quand `ios/` existe, donc les options d'`app.json` n'atteignaient pas l'app. Corrigé mais insuffisamment testé ; le test qui fait foi est sur **appareil réel verrouillé**, le simulateur ne suspendant pas l'app de la même façon.

⚠️ **Cartes et Android** : `react-native-maps` (1.20.1, épinglée par le SDK 54) utilise **Apple Maps sur iOS — sans clé** — mais **Google Maps sur Android, qui exige une clé API**. Sans elle la carte est **grise et vide**, sans planter. Voir `android.md`.

## Répertoire & ajout de contacts (façon WhatsApp) ✅

Livré le 30 juil. 2026 — la saisie manuelle d'un numéro était jugée trop longue par le client (frein à l'adoption).

- **`components/DirectoryPanel.tsx`** (segment « Répertoire » de l'onglet Contacts) : écran de **pré-consentement** avant toute lecture du carnet, puis `SectionList` — raccourcis Nouveau groupe / Nouvelle conversation en tête, section **« Sur Nexa »** (bouton Message ou Ajouter en ami selon `relationStatus`), section **« Inviter »** (SMS pré-rempli via `expo-sms`, lien `INVITE_URL`).
- **`lib/contacts.ts`** : permission → lecture `expo-contacts` → normalisation **E.164** (`libphonenumber-js`, région déduite de `expo-localization`, défaut `TR` — « 0532… » → « +90532… ») → `POST /users/contacts/match`. **Cache mémoire** du dernier résultat : sans lui, chaque bascule de segment relancerait une synchronisation et mangerait le quota.
- **Backend** `POST /users/contacts/match` : batch de numéros E.164 (filtre `/^\+\d{6,15}$/`), **rate limit Redis 12/h/utilisateur** (anti-scraping), block-aware, champs gated + `relationStatus`, **aucun stockage** des numéros reçus. `User.phone` est déjà `@unique` (indexé).
- **Décisions assumées** : numéros envoyés **en clair** (hacher des numéros = fausse sécurité, l'espace est énumérable — même constat que WhatsApp) ; **non-stockage** des non-inscrits ; consentement explicite ; rate limit. Hachage envisageable en V2 si le juriste KVKK l'exige.
- **Ajout par numéro** conservé en repli : `components/AddContactSheet.tsx` (drawer depuis le header de l'onglet Contacts) — `POST /users/search-by-phone`, historique récent en SecureStore.
- **QR de profil** : `QrCode` (rendu pur JS) affiche `Linking.createURL('/user/<id>')` → `nexa://user/<id>` en build ; `QrScanner` (expo-camera) ouvre le profil scanné. Le `scheme` de l'app est **`nexa`** (rebranding du 29 juil., ex-`firstapp`).
- ⏳ Restant : `INVITE_URL` est un **placeholder** (vrai lien store / universal link une fois publié) ; pas de recherche locale dans le répertoire.

## Notifications push — bascule Expo (chantier en cours 🔄)

⚠️ **Non commité au 1er août 2026** (mobile : `app.json`, `app/_layout.tsx`, `lib/notifications.ts`, `app/(tabs)/profile.tsx`, `targets/` — backend : `src/lib/push.ts`, suppression de `src/lib/fcm.ts`, `users.*`, `socket.ts`).

- **Pourquoi** : l'app enregistrait un jeton **APNs** (`getDevicePushTokenAsync`) là où firebase-admin attend un jeton **FCM**. Tous les envois échouaient, et le serveur purgeait le jeton en réponse à l'erreur. → passage au **service push d'Expo** (`expo-server-sdk` côté backend, `getExpoPushTokenAsync({ projectId })` côté app), qui relaie vers Apple et Google avec ses propres identifiants : plus de clé APNs ni de `GoogleService-Info.plist` à gérer côté serveur.
- **Un jeton = un APPAREIL, pas un utilisateur** : `updateFcmToken` est une **transaction** qui retire le jeton de tous les autres comptes ; `DELETE /users/me/fcm-token` le libère à la déconnexion (appelé **avant** `clearTokens()`, la requête a besoin du JWT). Sans ça, deux comptes utilisés successivement sur le même téléphone recevaient tous deux leurs notifications dessus — jusqu'à être notifié de ses propres messages.
- Les jetons d'ancien format (APNs bruts) sont détectés par `Expo.isExpoPushToken` et purgés : l'appareil en réenregistre un correct au lancement suivant. **La colonne reste `User.fcmToken`** (pas de migration) mais contient désormais un `ExponentPushToken[…]`.
- **Socket coupé en arrière-plan** (`AppState` → `pauseSocket()` / `resumeSocket()` dans `app/_layout.tsx`) : le serveur ne pousse qu'aux utilisateurs **hors ligne**, et une app en arrière-plan gardait son socket ouvert — donc restait « en ligne » quelques secondes, pendant lesquelles les messages partaient en événement socket dans le vide, **sans notification**. On ferme donc explicitement sur `background` (pas sur `inactive` : bascule d'app, centre de contrôle, appel entrant). Effet voulu : la présence « en ligne / vu le … » devient exacte.
  - ⚠️ `pauseSocket` fait `socket.disconnect()` en **conservant l'instance** (les écrans gardent la référence obtenue à leur montage) ; `disconnectSocket()` — qui met l'instance à `null` — reste réservé au changement de compte. `connectSocket()` réutilise l'instance existante au lieu d'en créer une seconde, sinon écouteurs éparpillés et messages en double.
  - `resumeSocket` **relit le jeton d'accès** avant de rouvrir : après une longue veille, l'ancien (15 min) est expiré et le serveur refuserait la connexion.
  - Rattrapage à la reconnexion : le chat ré-émet `join_conversation` et recharge sa dernière page ; la liste des conversations se recharge (`useFocusEffect` ne rejoue pas au retour d'arrière-plan, l'écran n'ayant jamais perdu le focus).
- **Ouverture depuis une notification** (`app/_layout.tsx`) : `addNotificationResponseReceivedListener` (app lancée) **+** `getLastNotificationResponseAsync` (app démarrée *par* la notification — l'événement est déjà passé au montage) → `router.push('/chat/<conversationId>')`.
- **Mise en forme voulue (1ᵉʳ août)** : **titre** = nom de la personne ou du groupe, **corps** = contenu du message, **photo** de la personne ou du groupe à la place de l'icône de l'app. En **groupe**, l'expéditeur passe en **sous-titre** (iOS) : le serveur envoie le corps complet « Alice : salut » *et*, dans les données, `senderName` + `messageBody` séparés — l'extension iOS les rescinde, les plateformes sans sous-titre gardent la ligne complète.
  - Le titre et l'image sont recopiés dans `data` par `sendPushToMany` (`displayName`, `avatarUrl`) : **tous** les appelants en héritent (message, ajout/retrait de groupe, renommage, demande d'ami), inutile de les repasser à la main.
  - **iOS** : l'extension reconstruit un `INSendMessageIntent` (`INPerson` + `INImage`) et appelle `content.updating(from:)` → **notification de conversation** : avatar rond à gauche, à la place de l'icône de l'app. Repli automatique (`try?`) sur une pièce jointe — photo en vignette **à droite** — si l'API est refusée.
  - ⚠️ **Groupes — les 3 lignes « groupe / expéditeur / message »** : le **sous-titre n'est pas un champ qu'on remplit**. Dès qu'une intention est appliquée, un `content.subtitle` posé à la main est ignoré ; c'est le système qui compose les deux premières lignes. Il faut réunir **trois** conditions, toutes nécessaires (constaté le 1er août 2026, deux tentatives ratées avant) :
    1. **plusieurs `recipients`** dans l'`INSendMessageIntent` — c'est ce qui fait traiter la conversation comme un groupe ; avec `nil` ou un seul, la seconde ligne est **ignorée** ;
    2. **`sender`** → **titre**, **`speakableGroupName`** → **sous-titre**. ⚠️ Vérifié sur iPhone : c'est l'**inverse** de ce qu'indique la doc communautaire. Les rôles sont donc **volontairement inversés** dans le code — le **groupe** est passé comme `sender`, l'**expéditeur** comme `speakableGroupName`. Ne pas « corriger » sans revérifier sur un appareil ;
    3. la **photo est posée sur les deux** (`INPerson` du groupe + `setImage(…, forParameterNamed: \.speakableGroupName)`) : c'est la même image, et cela évite de dépendre de celle que le système consulte en premier.
    En conversation directe, rien de tout ça — `recipients: nil`, pas de `speakableGroupName`, photo sur le `sender`.
  - **Sans photo** : l'extension **dessine l'avatar par défaut** au lieu de laisser iOS retomber sur l'icône de l'app — l'**initiale** sur pastille pour une personne (`UserAvatar`), **deux silhouettes** (`person.2.fill`) pour un groupe (`Ionicons people` côté app), aux mêmes couleurs `#EFF6FF`/`#1E40AF`. Idem si le téléchargement de la photo échoue. ⚠️ Un groupe sans photo **ne retombe pas** sur le portrait de l'expéditeur (choix : l'avatar de groupe dit mieux d'où vient le message). ⚠️ Toujours la variante **claire** : une extension ne connaît pas le thème de l'appareil. **Android n'a pas d'équivalent** : sa grande icône vient d'une **URL** (`richContent.image`), donc sans photo il n'y a rien à afficher — il faudrait servir un avatar généré (route backend ou jeu de PNG sur S3/CloudFront), non fait.
  - ✅ **Rendu confirmé sur iPhone le 1er août 2026** : la photo s'affiche bien **à gauche**, à la place de l'icône de l'app, avec l'entitlement porté par **la seule app principale** — iOS le vérifie sur l'app conteneur, pas sur le binaire de l'extension. **Ne pas** le rétablir sur l'extension : aucun gain, et le build casse (voir ci-dessous).
  - ⚠️ **Entitlement `com.apple.developer.usernotifications.communication` : accepté sur l'app, refusé sur l'extension** (constaté le 1er août 2026, build vérifié). L'extension a son **propre App ID** (`com.berke.nexa2.notification-service`) ; le provisioning automatique active la capability « Communication Notifications » sur `com.berke.nexa2` mais **pas** sur celui de l'extension → `error: Entitlement … not found and could not be included in profile (in target 'NexaNotificationService')`, et **tout le build échoue**, pas seulement l'extension. Il est donc déclaré dans `ios.entitlements` uniquement, **pas** dans `targets/notification/expo-target.config.js`. Pour l'obtenir sur l'extension : cocher la capability à la main sur developer.apple.com (Identifiers → l'App ID de l'extension), puis rétablir les 3 lignes dans `expo-target.config.js`.
  - **Android** : la photo part en `richContent.image` → `expo-notifications` la pose en **grande icône** (`setLargeIcon`) ; elle est à gauche jusqu'à Android 11, **à droite depuis Android 12** (changement de gabarit système). Un rendu « conversation » façon WhatsApp y demanderait `MessagingStyle` + shortcuts, **non exposé par `expo-notifications`** → module natif à écrire, non fait.
  - **Petite icône Android** : `assets/images/notification-icon.png` (96×96, silhouette blanche + alpha, dérivée du logo) déclarée via le plugin `expo-notifications` avec `color: "#1E40AF"`. ⚠️ Sans elle, Android affiche l'icône de l'app pleine → **carré blanc** dans la barre d'état.
- `app.json` : `appleTeamId`, `NSUserActivityTypes: ["INSendMessageIntent"]`, `ios.entitlements`, plugins `@bacons/apple-targets` et `expo-notifications`. **Rebuild natif requis** (`npx expo prebuild -p ios` puis build — `ios/` et `android/` sont gitignorés, donc régénérables).
- ⚠️ **`expo prebuild -p ios` échoue tant que la cible d'extension existe déjà** : `Target "NexaNotificationService" already exists, updating instead of creating a new one` puis `TypeError […] Cannot read properties of undefined (reading 'removeFromProject')`. `@bacons/apple-targets` sait créer la cible, pas la mettre à jour. **Toujours passer `--clean`** dès qu'un prebuild iOS est nécessaire (rencontré les 1ᵉʳ et 5 août) — c'est sans risque, `ios/` étant gitignoré.
- ⏳ À vérifier avant de considérer le chantier clos : réception réelle sur les 2 iPhones (dont le rendu avatar, qui dépend de la signature) et sur **Android**.

## Social : amis, confidentialité, blocage (épopée multi-phases) 🔄

Construction **par phases livrables**, toutes les règles de confidentialité **vérifiées côté serveur**.

### Modèle de données

- **Profile** : matrice de confidentialité (chaque champ = `everyone` | `friends` | `nobody`) — `privacyPhoto`, `privacyBio`, `privacyLastSeen`, `privacyLocation` (défaut `friends`), `privacyPhone`, `privacyMessages`, `privacyCalls`, `privacyFriendRequests` + `locationEnabled` (bool, défaut false) + **`readReceipts`** (bool, défaut true — accusés de lecture)
- **User** : `lastSeenAt`
- **FriendRequest** `{ fromUserId, toUserId, status: pending|refused, createdAt, respondedAt }` (refused + date = cooldown 7j) ; unique `[fromUserId, toUserId]`
- **Friendship** `{ userAId, userBId }` symétrique, **ordre canonique userAId < userBId** (`orderPair`) ; unique `[userAId, userBId]`
- **Block** `{ blockerId, blockedId }` ; **Report** `{ reporterId, reportedId, category }`
- Helpers partagés : `src/modules/social/relation.service.ts`

### Statut des phases

- **Phase 1 ✅** — Fondation backend (modèles + migration `social_foundation`) + `relation.service` + `POST /users/search-by-phone` (rate limit Redis 20/h, block-aware, self, photo gated) + écran recherche par numéro (`(tabs)/search.tsx`) avec historique récent.
- **Phase 2 ✅** — Amis E2E : module `social/friends.*` (envoyer/accepter/refuser/annuler/cooldown 7j/supprimer + listes) + `GET /users/:id/profile` gated ; **écran profil** (`app/user/[id].tsx`, skeleton, champs gated, boutons dynamiques selon `relationStatus`, message/appels selon canMessage/canCall, amis en commun) ; **`FriendsPanel`** (mes amis + reçues + envoyées, actions inline, badge demandes) intégré comme **segment « Amis » de l'onglet Contacts** (`(tabs)/search.tsx`). La carte de recherche ouvre désormais le profil.
- **Phase 3 ✅** — `PATCH /users/me/privacy` (validation serveur) + écran **Confidentialité** (`app/privacy.tsx`, 8 réglages via `BottomSheet` + toggle localisation), accessible depuis le profil. Les règles sont déjà appliquées serveur (Phases 1-2).
- **Phase 4 ✅** — `social/moderation.*` : `POST/DELETE/GET /blocks` (effets blocage : amitié + demandes supprimées, recherche/profil masqués) + `POST /reports` (4 catégories). Menu **« ... » Bloquer/Signaler** sur le profil + page **`app/blocked.tsx`** (accessible depuis Confidentialité). ⏳ Restant : masquer les messages existants côté bloqué + rejet d'appels (Mois 4).
- **Phase 5 ✅** — Demandes de messages : `ConversationMember.accepted` (migration `message_requests`) ; `getOrCreateDirectConversation` applique blocage + `privacyMessages` (nobody/friends/everyone) et met la cible en « demande » si non-ami ; liste normale filtrée sur `accepted=true` ; `GET /conversations/requests` + accept/decline ; **socket `send_message`** refuse si blocage (direct) et **ne pousse pas** aux membres en demande (badge seul). Front : écran **`app/requests.tsx`** + **bannière badge** dans la liste des conversations. ⏳ Pas d'accusés de lecture dans l'app (donc rien à geler).
- **Phase 6 ✅** — `social/notify.service.ts` : demande d'ami **reçue** + **acceptée** → push si hors-ligne, sinon event socket → **notif in-app locale** (listeners globaux dans `_layout`). Demande de message = badge seul (Phase 5). ⏳ Appel entrant = Mois 4 (Agora).

**→ Épopée sociale : Phases 1-6 terminées.** Restant transverse : afficher la localisation au profil (Mois 3, voir planning), masquer messages existants côté bloqué + rejet d'appels (Mois 4), notif appel entrant (Mois 4).

⚠️ Règles : ne jamais révéler l'existence d'un compte bloqué/masqué ; validation confidentialité **serveur uniquement** ; bouton d'action principal dynamique selon `relationStatus`.

---

## Sécurité — état actuel

### En place ✅

- JWT access 15min + refresh 7j, secrets en variables d'environnement
- Vérification expiration JWT au démarrage — redirection vers welcome si les deux tokens sont expirés
- Handler SESSION_EXPIRED global dans `api.ts` — redirection automatique depuis n'importe quel écran
- OTP sans mot de passe (pas de risque fuite password)
- Socket.io : vérification JWT + membership sur chaque événement
- Autorisation groupes : admin only pour add/remove/rename
- Stories : owner-only delete
- Chat : `assertMember` sur toutes les routes de conversation (médias, épinglés, favoris, mute, éphémère) — jamais d'accès à une conv dont on n'est pas membre
- SecureStore côté client (chiffré, pas AsyncStorage)
- Consentement à la politique de confidentialité intégré — case opt-in **obligatoire à l'inscription** (`login.tsx`, signup uniquement), persisté via `POST /users/me/privacy-consent` après création du compte (stocke `privacyConsent` + `privacyConsentAt` + `privacyPolicyVersion`) ; lien vers la politique = `PRIVACY_URL`, version = `PRIVACY_POLICY_VERSION` (`lib/config.ts`, ⚠️ **URL placeholder à remplacer** par la vraie page web)
- `firebase-service-account.json` dans `.gitignore` (devenu inutile depuis la bascule sur Expo Push, mais la règle reste)
- Jeton push **rattaché à un seul compte** (transaction) et **libéré à la déconnexion** — un appareil ne reçoit jamais les notifications d'un compte qu'il a quitté
- Répertoire : **pré-consentement** avant lecture du carnet, numéros **non stockés** côté serveur, rate limit 12/h (anti-scraping)

### À faire en Mois 5 (avant prod) ⚠️

- Rate limiting sur `/auth/send-code` et `/auth/verify-code` (anti-spam OTP)
- Limite de tentatives OTP (3 essais max)
- Helmet.js (headers HTTP sécurité)
- Validation stricte des inputs (zod ou joi)
- CORS restreint aux domaines autorisés (pas `*`)
- Validation URLs médias (S3 uniquement en prod)
- **Trancher le comportement d'« Effacer la conversation »** — aujourd'hui purement local (horodatage SecureStore, voir section Chat) : après réinstallation ou changement d'appareil, la conversation **réapparaît intégralement**. Acceptable pour les réglages cosmétiques (fond, surnom, couleur), discutable ici — un utilisateur qui « efface » attend souvent un effacement durable. Options : garder tel quel mais l'expliciter dans l'UI, ou persister l'horodatage côté serveur (par membre)
- **Sortir `GIPHY_API_KEY` de `lib/config.ts`** — clé en dur dans le bundle, contraire à la règle « jamais de clé API en dur » (passer par une variable d'env EAS, ou mieux : proxifier Giphy côté backend). ⚠️ La clé étant **déjà commitée**, la retirer du fichier ne suffit pas : il faut la **révoquer et en régénérer une** sur developers.giphy.com

### Décisions architecturales

- **Pas de E2EE en V1** : incompatible avec modération + dashboard admin + loi turque KVKK
  (les autorités turques ont droit d'accès aux données — E2EE serait un risque légal)
- E2EE prévu en V2 si demande client

---

## Règles de développement

- Variables d'environnement pour toutes les clés API — jamais en dur.
- Architecture modulaire : un dossier par feature dans `src/modules/`.
- WebSockets pour la messagerie, API REST pour le reste.
- Idempotence sur les appels critiques (auth, création de compte).
- Logs centralisés via AWS CloudWatch (en prod).
- **Priorité features > finitions UI** — les polissages (tri, timestamps, animations) sont pour Mois 5/QA.
- Médias : jamais stockés en BDD — uniquement URLs vers S3/CDN.
- **Backlog** : le fichier **`todo`** à la racine du repo mobile fait foi pour ce qui reste à faire (items barrés = livrés, avec un résumé de ce qui a été fait). Le tenir à jour en même temps que ce fichier.
- **Android** : le fichier **`android.md`** à la racine recense tout ce qui n'a pas été vérifié sur Android ou y demande un travail à part (le dev se fait sur iOS). À compléter dès qu'une livraison laisse un écart entre les deux plateformes.

## Notes techniques importantes

- **Prisma v5** — ne pas upgrader en v7 (breaking changes majeurs sur la config datasource).
- **OTP** simulé en local (log console). Remplacer par Twilio avant la mise en prod.
- **i18n** : initialisé dans `app/_layout.tsx` via `import '../lib/i18n'`. **Langue détectée automatiquement au 1er lancement** depuis la langue de l'appareil (`expo-localization`, mappée sur tr/fr/en sinon turc) ; un choix explicite sauvegardé (SecureStore) prime ensuite. Modifiable via le profil (`setAppLanguage` + `PATCH /users/me`). Clés organisées par groupes imbriqués (`onboarding`, `auth`, `country_picker`, …) — **garder les 3 fichiers `locales/*.json` strictement alignés** (mêmes clés). Écrans déjà branchés sur `t()` : onboarding (welcome/security/intro/login/verify), profil, CountryPicker, liste conversations (`(tabs)/index`), chat (`chat/[id]`), création de groupe (`group/new`), StoriesBar, viewer/éditeur de stories (`story/[id]`, `story/create`), caméra in-app (`StoryCamera`). Groupes de clés dédiés : `stories.*` (viewer + éditeur, ex. `time_now`/`minutes_short`/`views`), `camera.*`, `chat.*`, `details.*`, `media.*`, `mute.*`, `ephemeral.*`, `moderation.*`, `relation.*`, `fab.*`, `new_chat.*`, `system.*` (bandeaux de messages système), `theme.*` (apparence), `sections.*`/`about.*`/`profile_stats.*`/`share.*` (onglet Vous), `contacts_sync.*`/`scan.*` (répertoire + QR), `filters.*`/`conv_actions.*`/`preview.*`/`time.*` (liste des conversations), `roles.*` (groupes), `activity.*`/`community.*` (Actus), `notifications.*`. ⚠️ `tabs.search` a été **supprimé** (onglet renommé) : le libellé du segment recherche est `search_phone.segment`, celui de l'onglet `tabs.contacts`. **Pas encore traduits** : écran stub `saved` (Appels, Mois 4). `VideoTrimmer`/`MediaViewer` n'ont pas de texte.
- En local : PostgreSQL + Redis tournent via `docker-compose up -d` dans `first-app-backend/`.
- **Push iOS** : compte Apple Developer payant (99€/an) requis (entitlement `aps-environment`). Depuis la bascule sur Expo Push, **plus besoin de clés APNs dans Firebase Console** ni de `GoogleService-Info.plist` — voir la section Notifications push.
- **`lib/config.ts`** contient aussi `PRIVACY_URL` / `PRIVACY_POLICY_VERSION` (⚠️ URL placeholder) et `GIPHY_API_KEY` (⚠️ clé en dur, à sortir avant la prod).
- **URL backend** : centralisée dans `lib/config.ts` (`BASE_URL = __DEV__ ? LOCAL_URL : CLOUD_URL`). En dev (Metro) → backend **local** (mettre à jour `LOCAL_URL` à chaque changement de réseau Wi-Fi) ; en build release/EAS → backend **Railway** (`CLOUD_URL`). `api.ts` et `socket.ts` importent `BASE_URL` depuis `config.ts`.
- **Native tabs** : import depuis `expo-router/unstable-native-tabs` — API peut changer (alpha).
- **Bundle ID iOS** : `com.berke.nexa2` (rebranding Nexa ; historique `org.name.firstapp` → `com.berke.firstapp` → `com.berke.nexa2`). **Scheme deep link** : `nexa` (ex-`firstapp`, changé le 29 juil. 2026) — utilisé par le QR de profil (`nexa://user/<id>`).
- **`reactCompiler: true`** dans `app.json` (`experiments`) : le compilateur React mémoïse automatiquement. Ne pas s'en remettre à lui pour la stabilité des **gestes** ni des **worklets** — continuer à stabiliser explicitement (`useMemo`, callbacks via ref), cf. `StoryCamera`/`VideoTrimmer`.
  - ⚠️ **Un hook doit RENVOYER la valeur qu'il observe.** Constaté le 6 août 2026 sur `useMyLiveShare` : il appelait `useSyncExternalStore` puis lisait l'état par un appel externe (`myShareExpiry(id)`). Le compilateur a le droit de mémoïser cet appel sur ses arguments — ici un `conversationId` qui ne change jamais — et l'affichage restait **figé jusqu'au remontage de l'écran** (le bandeau de partage ne réagissait ni au démarrage ni à l'arrêt). Suivre la forme de `friendRequests.ts` / `unreadMessages.ts` : `return useSyncExternalStore(subscribe, snapshot, snapshot)`.
- **Signing iPhone physique** : `npx expo run:ios --device` échoue sur un bundle neuf (`No profiles for '…' were found`) car il ne passe pas `-allowProvisioningUpdates` à `xcodebuild`, seul moyen de faire créer l'App ID + le profil. Solution **une fois par bundle** (et à rejouer après tout ajout de capability, ex. Communication Notifications), sans passer par Xcode : `xcodebuild -workspace ios/Nexa.xcworkspace -scheme Nexa -configuration Debug -destination "id=<UDID>" -allowProvisioningUpdates build` (⚠️ le projet généré s'appelle **`Nexa`** depuis le rebranding, plus `firstapp`). ⚠️ L'iPhone doit être **branché, déverrouillé et écran allumé** pendant toute la commande, sinon elle échoue sur `Development services need to be enabled` / `Timed out waiting for all destinations` — un message trompeur qui ne parle pas de signature, et `xcodebuild` **sort alors en code 0** malgré l'échec.
- **Icône iOS 26 (Liquid Glass)** : bundle **Icon Composer** `assets/images/Nexa-icon-comp.icon` référencé via `ios.icon` dans `app.json` (supporté SDK 54+). Fallback auto sur iOS ancien ; `icon.png` racine = Android + base. Modif **native** → rebuild EAS requis ; bien **committer le `.icon`** avant le build.
- **expo-video** : module natif (plugin config) — après son install, **rebuild requis** (`npx expo run:ios`), un reload Metro ne suffit pas.
- **Stories texts** : colonne `Json` côté backend → ajouter un champ de style ne nécessite **aucune migration** ni changement backend (passe par `lib/storyText.ts` côté app).
- **Réglages locaux de conversation** (fond, surnom, couleur de bulle, « effacer ») : stockés en **SecureStore**, donc **aucun backend** — ne pas chercher d'endpoint côté serveur pour ces réglages.
- **Accusés de réception / lecture** (migration `message_receipts`, 6 août 2026) : `ConversationMember.lastDeliveredAt`, **symétrique de `lastReadAt`** — une date par membre, pas un état par message. Un message est « reçu » (ou « vu ») quand **tous les autres membres** l'ont dépassé : les groupes fonctionnent sans code en plus. Côté app (`chat/[id].tsx`), `receipts` garde le détail **par membre** et `statusAt()` prend le **plus ancien** ; se contenter du dernier événement afficherait la double coche dès le premier destinataire servi. État initial lu dans `meta.members` (Prisma y renvoie déjà les deux dates), entretenu ensuite par les events. Échelle rendue par `StatusIcon` : `sending` (horloge) → `sent` (coche) → `delivered` (double coche) → `read` (double coche bleue). ⚠️ **Pas d'état d'échec** : socket.io met les envois en tampon et les rejoue à la reconnexion, donc l'annoncer serait faux et un bouton « réessayer » enverrait deux copies. **Réglage de confidentialité** (`Profile.readReceipts`, migration `read_receipts_privacy`) : désactivé, mes lectures ne sont plus diffusées **et** je ne vois plus celles des autres — réciprocité assumée, comme WhatsApp, sans quoi le réglage serait un avantage unilatéral. ⚠️ Appliquée **côté serveur** (envoi de `conversation_read` ciblé par membre au lieu d'une diffusion à la room, + masquage de `lastReadAt` dans les métadonnées) : la laisser au client suffirait à contourner la réciprocité en modifiant l'app. Ne touche **pas** aux accusés de réception, qui disent que le message est arrivé, pas qu'il a été ouvert. **Accusé de réception en arrière-plan** (6 août 2026) : l'app fermant son socket en arrière-plan — c'est ce qui permet aux notifications d'exister — plus rien ne peut répondre au serveur ; seul le code qui traite la notification s'exécute encore. iOS : l'**extension** (`targets/notification`) envoie le rappel. Android : tâche de fond `expo-notifications` + TaskManager (`lib/deliveryReceipt.ts`), faute d'équivalent. Authentifiés par jeton signé (voir `POST /receipts/delivered`). L'URL de rappel voyage dans la notification (`PUBLIC_URL`, variable d'env backend) : ces contextes ne peuvent pas lire `lib/config.ts` ni son `__DEV__` — **à définir dans Railway**, et à mettre à jour en local au changement de Wi-Fi comme `LOCAL_URL`. Absente, l'accusé en arrière-plan est simplement inactif, la réception restant constatée au retour au premier plan. ⚠️ **Rebuild natif requis** — et pour les conversations **en sourdine** ou en **demande de message**, qui ne reçoivent aucune notification visible, un **push silencieux** (`_contentAvailable`) porte le jeton : il n'éveille pas l'extension (réservée aux notifications affichées) mais la **tâche de fond**, d'où `UIBackgroundModes: remote-notification` dans `app.json`, sans lequel iOS écarte le push côté appareil. Sert aussi à rafraîchir la pastille, qui ne bougeait pas non plus. ⚠️ **App tuée = pas d'accusé** dans ces cas : iOS ne délivre pas les pushes silencieux à une app forcée à quitter. Décision du 6 août : assumé plutôt que de passer en `interruptionLevel: 'passive'`, qui l'aurait couvert au prix d'une entrée dans la liste des notifications. Restera imparfait par nature : téléphone éteint ou sans réseau, la double coche arrive en différé (comme chez WhatsApp).
- **Migrations chat** : `phase_c_mute_ephemeral_pin_star` (mute, éphémères, `PinnedMessage`, `StarredMessage`), `phase_d_message_media` (`mediaUrl`/`mediaType`/`fileName`/`fileSize`/`mimeType`/`durationMs`/`hasLink`) , `conversation_list` (`lastReadAt`/`pinnedAt`/`favoritedAt` sur `ConversationMember`) et `message_batch` (`Message.batchId` — médias d'un même envoi regroupés en album).
- ⚠️ **Ne pas confondre** : `PinnedMessage`/`StarredMessage` = un **message** épinglé/favori dans une conversation (Phase C) ; `ConversationMember.pinnedAt`/`favoritedAt` = la **conversation entière** épinglée/favorite dans la liste. Endpoints voisins mais distincts (`/messages/:msgId/pin` vs `/:id/pin`).
- **Groupes enrichis** (migration `group_roles_info`) : `Conversation.photoUrl`/`description`/`whoCanSend` (`all`|`admins`) ; `ConversationMember.role` accepte `admin`|`moderator`|`member` (String, pas de migration schéma). Permissions : **admin** = tout ; **modérateur** = ajouter/retirer membres (pas un admin), épingler/supprimer messages ; **membre** = poster (sauf groupe `whoCanSend:admins`) + supprimer ses propres messages. Rôles gérés dans `messages.service` (helper `canManage`), `GET /conversations/:id` renvoie `whoCanSend`/`myRole`/membres+rôles. Le socket `send_message` refuse si `whoCanSend:admins` et pas admin/mod. Écran = `app/group/[id].tsx`.
