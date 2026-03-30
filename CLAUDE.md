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

Il n'y a pas de commande de build ou de test définie dans ce projet.

## Architecture

Application React Native multi-plateforme (iOS, Android, Web) basée sur **Expo SDK 54** avec **Expo Router** pour le routage fichier (similaire à Next.js).

### Routage

Le routage est entièrement basé sur la structure de fichiers dans `app/` :

- `app/_layout.tsx` — Layout racine avec un `<Stack>` navigator.
- `app/(tabs)/_layout.tsx` — Navigation par onglets du bas avec 4 onglets : Home, Search, Saved, Profile.
- `app/(tabs)/index.tsx` — Écran principal (Home).

### Styling

**NativeWind v4** (Tailwind CSS pour React Native) :
- Les classes Tailwind s'utilisent directement via la prop `className` sur les composants React Native.
- Configuration dans `tailwind.config.js` — couleur primaire : `#1E40AF`.
- Les styles globaux sont dans `app/globals.css`, importés dans le layout racine.

### Alias de chemins

`@/*` pointe vers la racine du projet (configuré dans `tsconfig.json`).

### Configuration notable

- **TypeScript strict** activé.
- **React Compiler** et **Typed Routes** activés dans `app.json`.
- **New Architecture** React Native activée.
- Icônes : `@expo/vector-icons` (Ionicons).
