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

### Planning

- **Mois 1** ✅ — Architecture, base de données, auth (JWT + OTP), profils, confidentialité, i18n
- **Mois 2** 🔄 — Messagerie temps réel (Socket.io) ✅, groupes 🔜 (API créée, rooms Socket.io à finaliser), notifications push (FCM) 🔜
- **Mois 3** — Stories (24h), version web (Next.js + Firebase), localisation, médias (S3)
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
- Socket.io (Mois 2)
- JWT + refresh tokens pour l'auth

### Infrastructure AWS (prod)

- ECS → backend Docker, RDS PostgreSQL, ElastiCache Redis, S3, CloudFront, API Gateway

### Services tiers

- **Agora.io** — appels audio/vidéo (facturation par participant)
- **Firebase** — sync multi-appareils web
- **FCM** — notifications push (gratuit)
- **Google Maps + expo-location** — localisation

---

## Structure de l'app mobile

```
app/
├── _layout.tsx          # Layout racine — importe lib/i18n
├── globals.css
└── (tabs)/
    ├── _layout.tsx      # Tab navigator (4 onglets)
    ├── index.tsx        # Home
    ├── search.tsx       # Recherche
    ├── saved.tsx        # Sauvegardé
    └── profile.tsx      # Profil
lib/
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
│   └── socket.ts                   # Init Socket.io + middleware JWT + événements
├── middlewares/
│   └── auth.middleware.ts          # Middleware JWT (AuthRequest)
└── modules/
    ├── auth/                       # OTP simulé en local (→ Twilio en prod)
    │   ├── auth.service.ts
    │   ├── auth.controller.ts
    │   └── auth.routes.ts
    ├── users/                      # Profil + KVKK + confidentialité
    │   ├── users.service.ts
    │   ├── users.controller.ts
    │   └── users.routes.ts
    └── messages/                   # Conversations + messages
        ├── messages.service.ts
        ├── messages.controller.ts
        └── messages.routes.ts
prisma/
└── schema.prisma                   # Schéma complet (users, messages, stories, calls, points, sponsors...)
```

### Endpoints disponibles

```
GET  /health
POST /auth/send-code                          → envoie OTP (simulé en local : log console)
POST /auth/verify-code                        → vérifie OTP, crée user, retourne JWT
POST /auth/refresh                            → renouvelle l'access token
GET  /users/me                                → profil utilisateur (auth requise)
PATCH /users/me                               → mise à jour profil (auth requise)
POST /users/me/kvkk                           → acceptation KVKK (auth requise)
POST /conversations/direct                    → créer/récupérer une conv directe (auth requise)
POST /conversations/group                     → créer un groupe (auth requise)
GET  /conversations                           → liste des conversations de l'utilisateur (auth requise)
GET  /conversations/:conversationId/messages  → historique messages paginé (auth requise)
```

### Socket.io — événements

```
// Client → Serveur
join_conversation(conversationId)             → rejoindre la room d'une conversation
send_message({ conversationId, content, type }) → envoyer un message

// Serveur → Client
new_message(message)                          → message reçu en temps réel
error({ message })                            → erreur serveur
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
- **i18n** : initialisé dans `app/_layout.tsx` via `import '../../lib/i18n'`.
- En local : PostgreSQL + Redis tournent via `docker-compose up -d` dans `first-app-backend/`.
