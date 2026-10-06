import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  callFacts,
  callKind,
  callLabel,
  formatDuration,
  isLiveCall,
  MISSED_COLOR,
  type CallInfo,
  isVideoCall,
} from '../lib/callHistory';
import { useCall } from '../lib/callEngine';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';

/**
 * Bulle d'un appel dans le fil de discussion (demande de Berke, 25/09).
 *
 *   - ça sonne          → VERTE, « Appel en cours… » ; l'appelé la touche pour DÉCROCHER
 *   - en communication  → VERTE, chronomètre en direct
 *   - terminé           → neutre, « Appel sortant / entrant · 2:05 »
 *   - manqué            → ROUGE, « Appel manqué » (chez l'appelé seulement)
 *
 * ⚠️ Rien n'est stocké dans la bulle : `call` est l'état RÉEL de l'appel, relu par le
 * serveur et tenu à jour par l'événement `call_message_updated`. Ouverte au milieu d'un
 * appel, elle affiche donc la bonne durée ; ouverte après, le bon résultat.
 *
 * ⚠️ Le chronomètre part de `answeredAt` (horloge du SERVEUR) comparé à l'horloge du
 * téléphone. Les deux sont synchronisées par le réseau à la seconde près ; un appareil à
 * l'heure faussée afficherait une durée décalée d'autant. Accepté : c'est un affichage,
 * la durée qui fait foi est calculée par le serveur à la fin de l'appel.
 */

const GREEN = '#16A34A';

type Props = {
  call: CallInfo;
  currentUserId: string | null;
  /** L'heure du message, en bas à droite comme sur toutes les bulles. */
  time: string;
  t: (k: string, o?: any) => string;
  onPress: () => void;
  onLongPress: () => void;
};

export function CallBubble({ call, currentUserId, time, t, onPress, onLongPress }: Props) {
  const c = useThemeColors();
  // L'appel tel que CE téléphone le vit — sert à dire ce que fera un appui.
  const local = useCall();
  const facts = callFacts(call, currentUserId);
  const kind = callKind(facts);
  const live = isLiveCall(call);
  const ongoing = call.status === 'accepted' && !!call.answeredAt;

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!ongoing || !call.answeredAt) return;
    const from = new Date(call.answeredAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - from) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ongoing, call.answeredAt]);

  const isMe = facts.outgoing;
  const here = !!local && local.callId.toLowerCase() === call.id.toLowerCase() && local.status !== 'ended';

  /**
   * Ce que fera l'appui — même logique que `onCallPress` dans le chat :
   *   - l'appel sonne ici, ou on est l'appelé d'un appel qui sonne → répondre ;
   *   - on est dedans sur ce téléphone → revenir à l'écran d'appel ;
   *   - il vit ailleurs (autre appareil) → rien à proposer, on n'affiche que l'heure ;
   *   - il est fini → rappeler.
   */
  const hint = !live
    ? t('calls.tap_to_call_back')
    : here
      ? local!.direction === 'incoming' && local!.status === 'ringing'
        ? t('calls.tap_to_join')
        : t('calls.tap_to_return')
      : call.status === 'pending' && call.receiverId === currentUserId
        ? t('calls.tap_to_join')
        : null;
  const missed = kind === 'missed';
  const video = isVideoCall(call);

  const title = ongoing
    ? `${t(video ? 'calls.video_call' : 'calls.audio_call')} · ${formatDuration(elapsed)}`
    : kind === 'outgoing' || kind === 'incoming'
      ? `${callLabel(facts, t)} · ${formatDuration(call.duration ?? 0)}`
      : callLabel(facts, t);

  // Vert tant que l'appel vit ; rouge s'il a été manqué ; neutre sinon.
  const bg = live ? GREEN : c.card;
  const fg = live ? '#FFFFFF' : missed ? MISSED_COLOR : c.content;
  const sub = live ? 'rgba(255,255,255,0.85)' : c.muted;
  const iconBg = live ? 'rgba(255,255,255,0.2)' : missed ? '#FEE2E2' : c.canvas;

  return (
    <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 4 }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={hint ? `${title}. ${hint}` : title}
        style={[
          ROUND.bubble,
          {
            backgroundColor: bg,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingLeft: 10,
            paddingRight: 14,
            maxWidth: '80%',
            minWidth: 190,
            // Même ombre légère que les bulles : lisible sur n'importe quel fond de conversation.
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 1,
          },
        ]}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            // Vidéo : la caméra dans tous les états — le côté de la bulle dit déjà qui a appelé.
            name={video ? 'videocam' : missed ? 'call' : live ? 'call' : isMe ? 'arrow-up' : 'arrow-down'}
            size={18}
            color={live ? '#FFFFFF' : missed ? MISSED_COLOR : c.nexa}
          />
        </View>
        <View style={{ marginLeft: 10, flexShrink: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: fg, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}
          >
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: sub, fontSize: 12, marginTop: 2 }}>
            {hint ? `${hint} · ${time}` : time}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
