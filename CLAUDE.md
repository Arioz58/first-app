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
- Couleurs finales : **nuances de verts style WhatsApp** — à appliquer en Mois 5/6
- Couleur principale actuelle : `#1E40AF` (bleu) + `#128C7E` (nexa — vert WhatsApp, déjà en place sur les écrans auth)
- Couleur Tailwind custom : `bg-nexa`, `text-nexa`, `border-nexa` → `#128C7E`
- Tab bar : **native iOS** (`expo-router/unstable-native-tabs`) avec SF Symbols — pas de tab bar custom JS

### Planning

- **Mois 1** ✅ — Architecture, BDD, auth (JWT + OTP), profils, KVKK, i18n (tr/fr/en)
- **Mois 2** ✅ — Messagerie temps réel (Socket.io), groupes (API + rooms + gestion membres), FCM push, frontend mobile complet
- **Mois 3** 🔄 — Stories 24h ✅ (éditeur texte riche + photo/vidéo, voir section dédiée), médias S3 ✅ (upload presigned + CloudFront), localisation 🔜, version web Next.js 🔜
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
- **expo-notifications + expo-device** — notifications push FCM
- **react-native-gesture-handler + react-native-reanimated** — gestes (pinch/pan/rotation) + animations (éditeur de stories, zoom viewer)
- **expo-image-picker + expo-image-manipulator** — sélection + crop des médias stories
- **expo-camera** — caméra in-app (photo/vidéo) pour les stories ⚠️ **module natif** (rebuild requis après install) ; permissions caméra/micro déclarées dans `app.json`
- **react-native-video-trim** — rognage temporel des vidéos (API **headless** `trim(uri, { startTime, endTime })` en ms → vrai fichier découpé) ⚠️ **module natif** (rebuild requis, pas de config plugin : autolinking via `expo run:ios`)
- **expo-video-thumbnails** — miniatures de la timeline de rognage ⚠️ **module natif** (rebuild requis)
- **expo-linear-gradient** — fonds dégradés des stories texte ⚠️ **module natif** (rebuild requis)
- **expo-image** — affichage d'images
- **expo-video** — lecture vidéo dans le viewer stories ⚠️ **module natif** (rebuild requis après install : `npx expo run:ios`)
- TypeScript strict

### Backend (`first-app-backend/`)

- Node.js + Express + TypeScript
- Prisma v5 + PostgreSQL (RDS en prod, Docker en local)
- Redis (ElastiCache en prod, Docker en local)
- Socket.io — messagerie temps réel + vérification membership
- JWT access (15min) + refresh tokens (7j) — auto-refresh côté client
- firebase-admin — FCM push notifications
- Nettoyage automatique stories expirées toutes les heures (setInterval)

### Infrastructure AWS (prod)

- ECS → backend Docker, RDS PostgreSQL, ElastiCache Redis, S3 + CloudFront (médias), API Gateway

### Services tiers

- **Agora.io** — appels audio/vidéo (Mois 4)
- **Firebase / FCM** — notifications push
  - ⚠️ iOS : nécessite compte Apple Developer payant (99€/an) + clés APNs dans Firebase Console
  - Android : fonctionne directement
- **Google Maps + expo-location** — localisation (Mois 3)
- **Twilio** — OTP SMS en prod (simulé en local via console.log)

---

## Structure de l'app mobile

```
app/
├── _layout.tsx          # Layout racine — vérif JWT expiry + handler SESSION_EXPIRED global + socket + FCM
├── globals.css
├── (auth)/              # Flux : welcome → security → intro → login → verify
│   ├── _layout.tsx
│   ├── welcome.tsx      # Écran d'accueil NEXA (slogan + image + Continuer) → security
│   ├── security.tsx    # Argument sécurité/confidentialité (Moti) → intro
│   ├── intro.tsx        # « Discutez librement » (Commencer / J'ai déjà un compte → login isNew=1/0)
│   ├── login.tsx        # Saisie numéro + indicatif pays (CountryPicker) — prénom si nouveau compte
│   └── verify.tsx       # Saisie OTP (6 champs individuels, auto-avance, coller) → JWT + socket + FCM
├── (tabs)/
│   ├── _layout.tsx      # NativeTabs (SF Symbols) — 4 onglets
│   ├── index.tsx        # Liste conversations + StoriesBar en header
│   ├── search.tsx       # Recherche (à implémenter)
│   ├── saved.tsx        # Appels (à implémenter Mois 4)
│   └── profile.tsx      # Profil (thème vert nexa) : avatar+photo (upload S3), édition du nom, sélecteur de langue i18n (PATCH + persistance), statut KVKK, déconnexion → welcome
├── chat/
│   └── [id].tsx         # Écran chat temps réel (Socket.io)
├── group/
│   └── new.tsx          # Création de groupe (saisie ID membres — améliorer avec recherche)
└── story/
    ├── [id].tsx         # Viewer stories (photo/vidéo, progress bar, pause au maintien, zoom, ordre chrono) — voir section Stories
    └── create.tsx       # Éditeur de story (photo/vidéo, textes stylables multiples, guides d'alignement, upload S3)
components/
├── StoriesBar.tsx       # Barre stories horizontale (style WhatsApp, useFocusEffect refresh)
├── StoryBackground.tsx  # Fond de story texte (uni / dégradé via expo-linear-gradient)
├── StoryCamera.tsx      # Caméra in-app (photo tap / vidéo maintien, flash, switch)
├── VideoTrimmer.tsx     # Rognage vidéo : preview + timeline à miniatures (trim headless)
├── EmojiPicker.tsx      # Sélecteur d'emojis (grille) pour les stickers de story
├── BottomSheet.tsx      # Drawer bottom-sheet réutilisable (SHEET_SPRING partagé : montage différé piloté par `visible`, drag-to-dismiss sur la poignée, backdrop en fondu) — hauteur fixe (liste) ou auto (contenu)
└── CountryPicker.tsx    # Sélecteur pays + indicatif — utilise `BottomSheet` (hauteur fixe 85% + recherche + FlatList)
lib/
├── api.ts               # Fetch wrapper — JWT Bearer + auto-refresh + handler SESSION_EXPIRED global
├── socket.ts            # Client Socket.io singleton
├── storage.ts           # SecureStore : accessToken, refreshToken, userId, language
├── notifications.ts     # Demande permission + enregistre token FCM au backend
├── countries.ts         # Liste pays avec drapeau, nom et indicatif téléphonique
├── storyText.ts         # Styles texte stories (couleur, fond none/translucent/solid, gras/italique/souligné) — partagé create + viewer
├── storyBackgrounds.ts  # Presets de fond stories texte (id → couleurs unies/dégradés)
├── storyStickers.ts     # Liste d'emojis stickers + STICKER_FONT_SIZE (partagé create + viewer)
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
│   └── fcm.ts                      # Firebase Admin : sendPushNotification / sendPushToMany
├── middlewares/
│   └── auth.middleware.ts          # Middleware JWT → AuthRequest.userId
└── modules/
    ├── auth/                       # send-code (OTP Redis 5min) + verify-code + refresh
    ├── users/                      # Profil + KVKK + fcmToken
    ├── messages/                   # Conversations direct/groupe + messages + gestion membres
    ├── stories/                    # Stories 24h : CRUD + groupées par user (texts en colonne Json)
    └── upload/                     # Presigned URL S3 (lib/s3.ts) — folder/ext selon contentType
prisma/
└── schema.prisma                   # User, Profile, Conversation, ConversationMember, Message, Story, Call, Points...
```

### Endpoints disponibles

```
GET  /health
POST /auth/send-code                              → envoie l'OTP (Twilio ou simulation console) ; `{ phone, mode? }` — `mode:'login'` refuse si compte inexistant, `mode:'signup'` refuse si déjà existant
POST /auth/verify-code                            → vérifie OTP, crée user si nouveau, retourne JWT
POST /auth/refresh                                → renouvelle access token

GET  /users/me                                    → profil complet
PATCH /users/me                                   → mise à jour (name, photoUrl, language...)
POST /users/me/kvkk                               → acceptation KVKK
POST /users/me/fcm-token                          → enregistrer/mettre à jour token FCM

POST /conversations/direct                        → créer/récupérer conv directe
POST /conversations/group                         → créer groupe (admin = créateur)
GET  /conversations                               → liste convs de l'user (avec dernier message)
GET  /conversations/:id/messages                  → historique paginé (cursor-based, 30/page)
POST /conversations/:id/members                   → ajouter membres (admin requis)
DELETE /conversations/:id/members/:userId         → expulser un membre (admin requis)
POST /conversations/:id/leave                     → quitter (promeut prochain admin si besoin)
PATCH /conversations/:id                          → renommer groupe (admin requis)

POST /upload/presigned-url                        → URL S3 presignée (contentType → ext/folder) + publicUrl CloudFront
POST /stories                                     → créer story (mediaUrl + texts[] JSON, expire dans 24h)
GET  /stories                                     → toutes stories actives groupées par user
GET  /stories/me                                  → mes stories actives (+ viewCount)
POST /stories/:storyId/view                       → enregistrer une vue (upsert idempotent, pas d'auto-vue)
GET  /stories/:storyId/views                      → liste des viewers (propriétaire uniquement)
DELETE /stories/:storyId                          → supprimer (propriétaire uniquement)
```

### Socket.io — événements

```
// Client → Serveur (vérification membership sur chaque event)
join_conversation(conversationId)
send_message({ conversationId, content, type })
leave_conversation(conversationId)

// Serveur → Client
new_message(message)                              → + FCM push si destinataire offline
members_added({ conversationId, memberIds })      → + FCM push aux nouveaux membres
member_removed({ conversationId, userId })        → + FCM push au membre expulsé
member_left({ conversationId, userId, newAdminId? })
added_to_group({ conversationId })
removed_from_group({ conversationId })            → redirige vers accueil côté app
group_updated({ conversationId, name })           → + FCM push à tous les membres
error({ message })
```

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
- UI : `StoryRing` (anneau **dégradé vert nexa** `expo-linear-gradient` si non vu / **gris** si vu) + `Avatar` (photo de profil ou initiale) ; **« Ma story »** affiche **ta photo de profil** (via `/users/me`) + badge `+` nexa toujours visible. Tout harmonisé sur le vert nexa (plus de bleu)
- **Anneau « non vu »** : bordure `border-nexa` (vert) si le groupe a au moins une story non vue, sinon `border-gray-300` (basé sur `hasUnviewed` renvoyé par `GET /stories`)

### Données / backend
- `texts` stocké en colonne **`Json`** → champs libres persistés tels quels (`content, normX, normY, scale, rotation, color, bgMode, bold, italic, underline`), **aucune validation backend** (le type étroit du service est cosmétique)
- Détection vidéo côté viewer via l'**extension de l'URL** (`.mp4` garanti par `upload.controller.ts`)
- **`StoryView`** (modèle Prisma, unique `[storyId, viewerId]`, cascade) : `recordStoryView` upsert idempotent (pas d'auto-vue), `getStoryViewers` owner-only ; `getActiveStories(viewerId)` tague `viewed`/`hasUnviewed`, `getMyStories` expose `viewCount` via `_count`

### Story fond coloré (texte seul) ✅
- Éditeur (`create.tsx`) : écran de choix à 2 boutons (**Photo/vidéo** ou **Story texte**) ; en mode texte, `bgId` (preset) + fond `StoryBackground` au lieu de l'image, **zoom/pan image neutralisés** via shared value `isTextOnly` (le pinch/rotation ne pilotent que le texte actif), sélecteur de fond (pastilles en bas). Publication **sans upload S3** : `POST /stories { background, texts }` (transform identité `s=1, tx=0, ty=0`).
- Presets dans `lib/storyBackgrounds.ts` (id → `colors[]`, 1 = uni / 2+ = dégradé) ; rendu partagé `components/StoryBackground.tsx` (`View` ou `expo-linear-gradient`). **Stocké = l'id du preset** → aucune migration pour ajouter un fond.
- Viewer + StoriesBar : si pas de `mediaUrl`, rendent `StoryBackground` ; le viewer démarre texte+timer **immédiatement** (pas de gating média).

### Reste à faire (features stories) 🔜
- Idées : stickers/emojis (réutilise le système de drag/pinch/rotate), mentions `@`, swipe-down pour fermer, audience (amis proches), highlights/archive au-delà de 24h

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
- SecureStore côté client (chiffré, pas AsyncStorage)
- KVKK/RGPD consentement intégré
- `firebase-service-account.json` dans `.gitignore`

### À faire en Mois 5 (avant prod) ⚠️
- Rate limiting sur `/auth/send-code` et `/auth/verify-code` (anti-spam OTP)
- Limite de tentatives OTP (3 essais max)
- Helmet.js (headers HTTP sécurité)
- Validation stricte des inputs (zod ou joi)
- CORS restreint aux domaines autorisés (pas `*`)
- Validation URLs médias (S3 uniquement en prod)

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

## Notes techniques importantes

- **Prisma v5** — ne pas upgrader en v7 (breaking changes majeurs sur la config datasource).
- **OTP** simulé en local (log console). Remplacer par Twilio avant la mise en prod.
- **i18n** : initialisé dans `app/_layout.tsx` via `import '../lib/i18n'`. **Langue détectée automatiquement au 1er lancement** depuis la langue de l'appareil (`expo-localization`, mappée sur tr/fr/en sinon turc) ; un choix explicite sauvegardé (SecureStore) prime ensuite. Modifiable via le profil (`setAppLanguage` + `PATCH /users/me`). Clés organisées par groupes imbriqués (`onboarding`, `auth`, `country_picker`, …) — **garder les 3 fichiers `locales/*.json` strictement alignés** (mêmes clés). Écrans déjà branchés sur `t()` : onboarding (welcome/security/intro/login/verify), profil, CountryPicker. **Pas encore traduits** : messages/chat, groupes, stories.
- En local : PostgreSQL + Redis tournent via `docker-compose up -d` dans `first-app-backend/`.
- **FCM iOS** : nécessite compte Apple Developer payant (99€/an) + clés APNs dans Firebase Console.
- **URL backend** : centralisée dans `lib/config.ts` (`BASE_URL = __DEV__ ? LOCAL_URL : CLOUD_URL`). En dev (Metro) → backend **local** (mettre à jour `LOCAL_URL` à chaque changement de réseau Wi-Fi) ; en build release/EAS → backend **Railway** (`CLOUD_URL`). `api.ts` et `socket.ts` importent `BASE_URL` depuis `config.ts`.
- **Native tabs** : import depuis `expo-router/unstable-native-tabs` — API peut changer (alpha).
- **Bundle ID iOS** : `com.berke.firstapp` (changé de `org.name.firstapp` pour signing perso).
- **Icône iOS 26 (Liquid Glass)** : bundle **Icon Composer** `assets/images/Nexa-icon-comp.icon` référencé via `ios.icon` dans `app.json` (supporté SDK 54+). Fallback auto sur iOS ancien ; `icon.png` racine = Android + base. Modif **native** → rebuild EAS requis ; bien **committer le `.icon`** avant le build.
- **expo-video** : module natif (plugin config) — après son install, **rebuild requis** (`npx expo run:ios`), un reload Metro ne suffit pas.
- **Stories texts** : colonne `Json` côté backend → ajouter un champ de style ne nécessite **aucune migration** ni changement backend (passe par `lib/storyText.ts` côté app).
