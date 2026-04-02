# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes principales

```bash
npm start          # Démarrer le serveur de développement Expo
npm run ios        # Lancer sur simulateur iOS
npm run android    # Lancer sur émulateur Android
npm run web        # Lancer en mode web
npm run lint       # Lancer ESLint via expo lint
```

---

## Contexte projet

Application de messagerie communautaire ciblant le marché turc (V1), avec ambition internationale.
Client : Hakan. Budget : 28 000€ (V1) + 6 000€ (V2) + 1 000€/mois maintenance. Délai : 6 mois.
DA finale : nuances de verts (style WhatsApp) — à appliquer en Mois 5/6. Placeholder actuel : `#1E40AF`.

### Planning

- **Mois 1** ✅ — Architecture, base de données, auth (JWT + OTP), profils, confidentialité, i18n
- **Mois 2** ✅ — Messagerie temps réel (Socket.io), groupes (API + rooms + gestion membres), FCM, frontend mobile (auth, conversations, chat, profil)
- **Mois 3** 🔄 — Stories (24h) 🔜, médias (S3), localisation, version web (Next.js)
- **Mois 4** — Appels audio/vidéo (Agora.io)
- **Mois 5** — Points, leaderboard, anti-spam, module B2B, dashboard admin, site vitrine
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
- **NativeWind v4** — Tailwind CSS via prop `className`, couleur primaire `#1E40AF`
- **i18next + react-i18next** — 3 langues : turc (`tr`), français (`fr`), anglais (`en`)
- TypeScript strict, alias `@/*` → racine

### Backend (`first-app-backend/`)

- Node.js + Express + TypeScript
- Prisma v5 + PostgreSQL (RDS en prod, Docker en local)
- Redis (ElastiCache en prod, Docker en local)
- Socket.io (messagerie temps réel)
- JWT + refresh tokens pour l'auth
- firebase-admin (FCM notifications push)

### Infrastructure AWS (prod)

- ECS → backend Docker, RDS PostgreSQL, ElastiCache Redis, S3, CloudFront, API Gateway

### Services tiers

- **Agora.io** — appels audio/vidéo (facturation par participant)
- **Firebase / FCM** — notifications push + sync web (iOS nécessite compte Apple Developer payant + APNs)
- **Google Maps + expo-location** — localisation

---

## Structure de l'app mobile

```
app/
├── _layout.tsx          # Layout racine — auth check + socket + FCM init
├── globals.css
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx        # Saisie numéro de téléphone
│   └── verify.tsx       # Saisie OTP + nom
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator (4 onglets)
│   ├── index.tsx        # Liste des conversations
│   ├── search.tsx       # Recherche
│   ├── saved.tsx        # Sauvegardé
│   └── profile.tsx      # Profil + déconnexion
├── chat/
│   └── [id].tsx         # Écran de chat temps réel
└── group/
    └── new.tsx          # Création de groupe
lib/
├── api.ts               # Fetch wrapper JWT + auto-refresh
├── socket.ts            # Client Socket.io singleton
├── storage.ts           # SecureStore (accessToken, refreshToken, userId)
├── notifications.ts     # Enregistrement token FCM
└── i18n.ts              # Config i18next (tr/fr/en)
locales/
├── tr.json
├── fr.json
└── en.json
```

## Structure du backend

```
src/
├── index.ts                        # Point d'entrée Express + HTTP server + Socket.io
├── lib/
│   ├── prisma.ts                   # Client Prisma singleton
│   ├── redis.ts                    # Client Redis
│   ├── socket.ts                   # Init Socket.io + middleware JWT + événements
│   └── fcm.ts                      # Firebase Admin SDK — sendPushNotification / sendPushToMany
├── middlewares/
│   └── auth.middleware.ts          # Middleware JWT (AuthRequest)
└── modules/
    ├── auth/                       # OTP simulé en local (→ Twilio en prod)
    ├── users/                      # Profil + KVKK + token FCM
    ├── messages/                   # Conversations + messages + gestion groupes
    └── stories/                    # Stories 24h (Mois 3 — en cours)
prisma/
└── schema.prisma                   # Schéma complet
```

### Endpoints disponibles

```
GET  /health
POST /auth/send-code
POST /auth/verify-code
POST /auth/refresh
GET  /users/me
PATCH /users/me
POST /users/me/kvkk
POST /users/me/fcm-token                          → enregistrer token FCM
POST /conversations/direct
POST /conversations/group
GET  /conversations
GET  /conversations/:conversationId/messages
POST /conversations/:conversationId/members       → ajouter membres (admin)
DELETE /conversations/:conversationId/members/:userId → expulser (admin)
POST /conversations/:conversationId/leave         → quitter le groupe
PATCH /conversations/:conversationId              → renommer (admin)
```

### Socket.io — événements

```
// Client → Serveur
join_conversation(conversationId)
send_message({ conversationId, content, type })
leave_conversation(conversationId)

// Serveur → Client
new_message(message)
members_added({ conversationId, memberIds })
member_removed({ conversationId, userId })
member_left({ conversationId, userId, newAdminId? })
added_to_group({ conversationId })
removed_from_group({ conversationId })
group_updated({ conversationId, name })
error({ message })
```

---

## Règles de développement

- Variables d'environnement pour toutes les clés API — jamais en dur.
- Architecture modulaire : un dossier par feature dans `src/modules/`.
- WebSockets pour la messagerie, API REST pour le reste.
- Idempotence sur les appels critiques (auth, création de compte).
- Logs centralisés via AWS CloudWatch (en prod).
- Docker pour tous les services backend.
- Modération : signalement utilisateur → alerte dashboard admin (client gère la modération).
- RGPD/KVKK : consentement intégré au modèle `User`.

## Notes techniques importantes

- **Prisma v5** — ne pas upgrader en v7 (breaking changes majeurs sur la config datasource).
- **OTP** simulé en local (log console). Remplacer par Twilio avant la mise en prod.
- **i18n** : initialisé dans `app/_layout.tsx` via `import '../lib/i18n'`.
- En local : PostgreSQL + Redis tournent via `docker-compose up -d` dans `first-app-backend/`.
- **FCM iOS** : nécessite compte Apple Developer payant + clés APNs uploadées dans Firebase Console.
- **IP locale** : mettre à jour `lib/api.ts` et `lib/socket.ts` si le réseau change.
