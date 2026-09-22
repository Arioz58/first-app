#!/bin/bash
# Aligne les adresses de développement sur le réseau courant.
#
# À rejouer à CHAQUE changement de Wi-Fi (partage de connexion compris) : l'application,
# le backend et le client web pointent tous sur l'IP de cette machine, et une adresse
# périmée se manifeste par des symptômes trompeurs — bandeau « hors ligne », accusés de
# réception muets, notifications sans effet.
set -e

MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$MOBILE/../first-app-backend"
WEB="$MOBILE/../first-app-web"

# On prend l'interface qui porte réellement la route par défaut : la machine peut avoir
# du Wi-Fi ET de l'Ethernet, et deviner en0 donnerait une adresse inutilisable.
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null)

if [ -z "$IP" ]; then
  echo "Aucune adresse sur l'interface par défaut ($IFACE) — pas de réseau ?" >&2
  exit 1
fi

echo "Interface $IFACE → $IP"

sed -i '' -E "s|(const LOCAL_URL = \")[^\"]*(\";)|\1http://$IP:3000\2|" "$MOBILE/lib/config.ts"
echo "  mobile   lib/config.ts        LOCAL_URL"

if [ -f "$BACKEND/.env" ]; then
  sed -i '' -E "s|^(PUBLIC_URL=\")[^\"]*(\")|\1http://$IP:3000\2|" "$BACKEND/.env"
  echo "  backend  .env                 PUBLIC_URL"
fi

# Le web tourne sur la même machine que le serveur : « localhost » lui suffit, et une IP
# le casserait dès que le réseau change. On n'y touche que s'il pointait déjà sur une IP.
if [ -f "$WEB/.env.local" ] && grep -qE "NEXT_PUBLIC_API_URL=http://[0-9]" "$WEB/.env.local"; then
  sed -i '' -E "s|(NEXT_PUBLIC_API_URL=)http://[0-9.]+:3000|\1http://$IP:3000|" "$WEB/.env.local"
  echo "  web      .env.local           NEXT_PUBLIC_API_URL"
fi

echo
echo "⚠️  Relancer le backend : nodemon ne surveille pas le .env, il sert encore l'ancienne"
echo "    PUBLIC_URL dans ses notifications."
echo "⚠️  Relancer l'application (recharger Metro ne suffit pas pour lib/config.ts)."
