# Provenance des sons

## Sons de notification (`notif_*.wav`, au choix dans le profil — 21/10/2026)

Tous convertis en WAV PCM 16 bits, 44,1 kHz, mono (iOS refuse le MP3 pour une notification),
silence de début et de fin retiré, puis ramenés à **−28,5 LUFS** — le niveau de
`notification.wav`, validé par Berke. Le gain est cuit dans le fichier : le système joue
une notification telle quelle.

| Fichier | Nom affiché | Source |
| --- | --- | --- |
| `notification.wav` | Nexa (défaut) | ancien son de réception fourni par Berke (20/09) × 0,34 |
| — | Son du téléphone | Aucun fichier : le son de notification réglé sur l'appareil (`sound: 'default'`) |
| `notif_cascade.wav` | Cascade | `36505577-ui-9-smooth-di-di-ding-sound-effect-365843.mp3`, 4ᵉ et dernière note retirée à la demande de Berke : coupe à 0,495 s et extinction progressive de la 3ᵉ note sur 205 ms (`afade=t=out:st=0.29:d=0.205:curve=qsin`) — une coupe nette sonnait trop brutale |
| `notif_iris.wav` | Iris | `bible_images-text-message-sound-effect-5-386088.mp3` |
| `notif_echo.wav` | Echo | `bible_images-whatsapp-message-sound-effect-1-386093.mp3` |
| `notif_opal.wav` | Opal | `bible_images-whatsapp-message-sound-effect-2-386094.mp3` |
| `notif_prisma.wav` | Prisma | `bible_images-whatsapp-message-sound-effect-9-387729.mp3` |
| `notif_lumen.wav` | Lumen | `kuzu420-shining-anime-sound-effect-240582.mp3` |
| `notif_orbit.wav` | Orbit | `universfield-new-notification-010-352755.mp3` |
| `notif_pulse.wav` | Pulse | `universfield-new-notification-040-493469.mp3` (fin conservée : elle est très douce et la coupe la supprimait) |
| `notif_halo.wav` | Halo | Synthèse maison : cloche, la5 (880 Hz) + partiels inharmoniques |
| `notif_nova.wav` | Nova | Synthèse maison : deux notes de marimba montantes, do6 → sol6 |
| `notif_comet.wav` | Comet | Synthèse maison : deux tintements de verre, mi7 → do7 |

Les fichiers téléchargés ont été fournis par Berke (dossier Téléchargements, 21/10). Leurs
noms (`auteur-titre-numéro.mp3`) sont ceux de Pixabay. ⚠️ **Licence à confirmer** avant la
mise en production : la page d'origine de chacun. ⚠️ Trois d'entre eux sont intitulés
« whatsapp message sound effect » (Echo, Opal, Prisma) : s'ils reproduisent le son de
WhatsApp, ils n'ont pas leur place dans une messagerie concurrente.

## Sons d'interface

- `sent.mp3` : envoi d'un message — `pop_sound.mp3` fourni par Berke (21/10), joué à 0,08 (~−38 LUFS, « doux, discret mais présent »).
- `received.wav` : réception app ouverte — le même pop abaissé de ~4 demi-tons (`ffmpeg -af "asetrate=44100*0.8,aresample=44100" -ac 1`), joué à 0,08, comme l'envoi (réglé à l'écoute).
- `ringback.wav` / `ringtone.wav` : tonalité et sonnerie d'appel, fabriquées (voir `lib/callSounds.ts`).
