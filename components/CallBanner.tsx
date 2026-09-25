import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expandCall, useCall } from '../lib/callEngine';
import { formatDuration } from '../lib/callHistory';

/**
 * Bandeau vert d'un appel RÉDUIT, en haut de l'application — comme WhatsApp.
 *
 * ⚠️ DANS LE FLUX, pas en calque flottant : il repousse toute l'application vers le bas au
 * lieu de la recouvrir. Une pastille posée par-dessus masquait l'en-tête de chaque écran
 * (le titre « Appels », le nom et le bouton retour du chat). Pour que les écrans se replacent
 * DESSOUS sans doubler leur marge du haut, la navigation est enveloppée dans son propre
 * `SafeAreaProvider` (`app/_layout.tsx`) : elle ne commence plus sous la barre d'état, sa
 * marge du haut tombe donc à zéro d'elle-même.
 *
 * ⚠️ Le bandeau occupe la barre d'état : son texte passe en clair, sinon l'heure et la
 * batterie seraient noires sur vert.
 */

const GREEN = '#16A34A';

export function CallBanner() {
  const call = useCall();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  const visible = !!call?.minimized;
  const status = call?.status;
  const startedAt = call?.startedAt ?? null;

  // Chronomètre recalculé depuis le décroché, comme sur l'écran d'appel : un compteur
  // incrémenté dériverait pendant les mises en veille.
  useEffect(() => {
    if (!visible || status !== 'active' || !startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible, status, startedAt]);

  if (!call || !visible) return null;

  const label =
    status === 'ended'
      ? t('calls.ended')
      : status === 'active'
        ? formatDuration(elapsed)
        : status === 'connecting'
          ? t('calls.connecting')
          : t('calls.calling');

  return (
    <Pressable
      onPress={expandCall}
      accessibilityRole="button"
      accessibilityLabel={t('calls.banner_hint')}
      style={{
        backgroundColor: status === 'ended' ? '#6B7280' : GREEN,
        paddingTop: insets.top,
      }}
    >
      <StatusBar style="light" />
      <View className="flex-row items-center justify-center px-4" style={{ height: 36 }}>
        <Ionicons name="call" size={15} color="#FFFFFF" />
        <Text numberOfLines={1} className="text-white font-semibold ml-2" style={{ flexShrink: 1 }}>
          {call.peer.name}
        </Text>
        {/* Chiffres tabulaires : sans eux, le texte tressaute à chaque seconde. */}
        <Text className="text-white ml-2" style={{ fontVariant: ['tabular-nums'] }}>
          · {label}
        </Text>
      </View>
    </Pressable>
  );
}
