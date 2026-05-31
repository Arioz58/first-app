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
- **Mois 3** 🔄 — Stories 24h ✅, médias S3 🔜, localisation 🔜, version web Next.js 🔜
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
- **expo-secure-store** — stockage JWT chiffré (pas AsyncStorage)
- **socket.io-client** — messagerie temps réel
- **expo-notifications + expo-device** — notifications push FCM
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
├── (auth)/
│   ├── _layout.tsx
│   ├── welcome.tsx      # Écran d'accueil NEXA (slogan + image + Continuer)
│   ├── intro.tsx        # Présentation chiffrement (Commencer / J'ai déjà un compte)
│   ├── login.tsx        # Saisie numéro + indicatif pays (CountryPicker) — prénom si nouveau compte
│   └── verify.tsx       # Saisie OTP (6 champs individuels, auto-avance, coller) → JWT + socket + FCM
├── (tabs)/
│   ├── _layout.tsx      # NativeTabs (SF Symbols) — 4 onglets
│   ├── index.tsx        # Liste conversations + StoriesBar en header
│   ├── search.tsx       # Recherche (à implémenter)
│   ├── saved.tsx        # Appels (à implémenter Mois 4)
│   └── profile.tsx      # Profil utilisateur + déconnexion → welcome
├── chat/
│   └── [id].tsx         # Écran chat temps réel (Socket.io)
├── group/
│   └── new.tsx          # Création de groupe (saisie ID membres — améliorer avec recherche)
└── story/
    ├── [id].tsx         # Viewer stories plein écran (progress bar, tap nav, suppression)
    └── create.tsx       # Créer une story (URL pour l'instant, S3 au Mois 3)
components/
├── StoriesBar.tsx       # Barre stories horizontale (style WhatsApp, useFocusEffect refresh)
└── CountryPicker.tsx    # Sélecteur pays avec indicatif téléphonique (modal + recherche)
lib/
├── api.ts               # Fetch wrapper — JWT Bearer + auto-refresh + handler SESSION_EXPIRED global
├── socket.ts            # Client Socket.io singleton
├── storage.ts           # SecureStore : accessToken, refreshToken, userId
├── notifications.ts     # Demande permission + enregistre token FCM au backend
├── countries.ts         # Liste pays avec drapeau, nom et indicatif téléphonique
└── i18n.ts              # Config i18next (tr/fr/en)
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
    └── stories/                    # Stories 24h : CRUD + groupées par user
prisma/
└── schema.prisma                   # User, Profile, Conversation, ConversationMember, Message, Story, Call, Points...
```

### Endpoints disponibles

```
GET  /health
POST /auth/send-code                              → OTP simulé (log console) → Twilio en prod
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

POST /stories                                     → créer story (expire dans 24h)
GET  /stories                                     → toutes stories actives groupées par user
GET  /stories/me                                  → mes stories actives
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
- **i18n** : initialisé dans `app/_layout.tsx` via `import '../lib/i18n'`.
- En local : PostgreSQL + Redis tournent via `docker-compose up -d` dans `first-app-backend/`.
- **FCM iOS** : nécessite compte Apple Developer payant (99€/an) + clés APNs dans Firebase Console.
- **IP locale** : mettre à jour `lib/api.ts` et `lib/socket.ts` à chaque changement de réseau.
- **Native tabs** : import depuis `expo-router/unstable-native-tabs` — API peut changer (alpha).
- **Bundle ID iOS** : `com.berke.firstapp` (changé de `org.name.firstapp` pour signing perso).
