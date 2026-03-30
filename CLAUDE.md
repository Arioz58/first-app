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

Pas de commande de build ou de test définie pour l'instant.

---

## Contexte projet

Application de messagerie communautaire ciblant le marché turc (V1), avec ambition internationale.
Client : Hakan. Budget : 28 000€ (V1) + 6 000€ (V2) + 1 000€/mois maintenance. Délai : 6 mois.

### Planning

- **Mois 1** — Architecture AWS, base de données, authentification (JWT), profils, confidentialité, i18n
- **Mois 2** — Messagerie temps réel (Socket.io), groupes, notifications push (FCM)
- **Mois 3** — Stories (24h), version web (Next.js + Firebase), localisation, médias (S3)
- **Mois 4** — Appels audio/vidéo (Agora.io)
- **Mois 5** — Points, leaderboard, anti-spam, module B2B, dashboard admin, site vitrine
- **Mois 6** — QA, corrections, mise en production (App Store + Google Play + AWS)

---

## Architecture technique

### Frontend
- **React Native (Expo)** — iOS + Android (ce repo)
- **Next.js** — version web synchronisée multi-appareils (type WhatsApp Web)

### Backend (repo séparé)
- Node.js + Express
- Socket.io pour la messagerie temps réel — API REST pour le reste
- JWT + refresh tokens pour l'auth

### Infrastructure AWS
- **ECS** — backend Node.js en containers Docker
- **RDS PostgreSQL** — base de données principale
- **ElastiCache Redis** — sessions, cache, présence en ligne, statuts temps réel
- **S3** — fichiers, photos, médias, stories
- **CloudFront** — CDN mondial, HTTPS
- **API Gateway + Load Balancer** — routage, rate limiting

### Services tiers
- **Agora.io** — appels audio/vidéo (facturation par participant : 1à1 = ×2)
- **Firebase** — sync multi-appareils web
- **FCM** — notifications push (gratuit)
- **Google Maps + expo-location** — localisation et partage de position

### Modèle de données (tables principales)
```
users, profiles, conversations, conversation_members,
messages, stories, calls, points, points_history,
leaderboard_monthly, sponsors, locations_shared
```

---

## Architecture de l'app mobile (ce repo)

Application Expo SDK 54 avec Expo Router (routage fichier).

### Structure des routes
```
app/
├── _layout.tsx          # Layout racine (Stack navigator)
├── globals.css          # Tailwind global
└── (tabs)/
    ├── _layout.tsx      # Tab navigator (4 onglets)
    ├── index.tsx        # Home
    ├── search.tsx       # Recherche
    ├── saved.tsx        # Sauvegardé
    └── profile.tsx      # Profil
```

### Styling
**NativeWind v4** — classes Tailwind via prop `className`. Couleur primaire : `#1E40AF`.
Alias `@/*` → racine du projet.

### Configuration notable
- TypeScript strict activé
- React Compiler + Typed Routes activés (`app.json`)
- New Architecture React Native activée
- Icônes : `@expo/vector-icons` (Ionicons)

---

## Règles de développement

- Variables d'environnement pour toutes les clés API (AWS, Agora, Firebase, Google Maps) — jamais en dur.
- Architecture modulaire : chaque fonctionnalité dans son propre module/dossier.
- WebSockets pour la messagerie, API REST pour le reste.
- Idempotence sur tous les appels critiques (auth, création de compte, transferts).
- Logs centralisés via AWS CloudWatch.
- Tests unitaires sur les modules critiques (auth, points, anti-spam).
- Docker pour tous les services backend (déploiement ECS).
- Modération : système de signalement → alerte dashboard admin (modération assurée par le client).
- RGPD/KVKK : intégrer politique de confidentialité et consentement.
