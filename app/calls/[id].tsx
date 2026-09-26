import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAvatar } from '../../components/UserAvatar';
import { apiRequest } from '../../lib/api';
import { startCall } from '../../lib/callEngine';
import {
  callIcon,
  callLabel,
  formatDayHeading,
  formatDuration,
  formatTime,
  MISSED_COLOR,
  type CallItem,
} from '../../lib/callHistory';
import { ROUND } from '../../lib/radius';
import { useThemeColors } from '../../lib/theme';

/**
 * Fiche d'appel — ouverte par le (i) d'une ligne de l'onglet Appels.
 *
 * Demande du client (24/09) : « une petite bulle d'information pour voir son profil […] avec
 * les options disponibles : appel, vidéo, messages ». Modèle retenu avec Berke : la fiche de
 * l'app Téléphone d'iOS — la personne, ses actions, puis l'historique des appels avec elle.
 *
 * ⚠️ Pas de bouton vidéo tant que la vidéo n'existe pas (décision du 24/09) : un bouton qui
 * ne fait rien se lit comme un bug. Il prendra place dans `actions` le jour venu.
 *
 * ⚠️ Les droits (message, appel) viennent de `GET /users/:id/profile`, calculés par le
 * serveur — la même source que le profil et le header du chat. Le serveur revérifie de toute
 * façon au moment d'appeler ou d'écrire : un bouton actif ici ne donne aucun droit.
 */

const NEXA = '#1E40AF';

/** Même ombre que les cartes du panneau de détails (`chat/details.tsx`). */
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

type Profile = {
  id: string;
  name: string;
  photoUrl: string | null;
  canMessage: boolean;
  canCall: boolean;
};

export default function CallInfoScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const c = useThemeColors();
  const { id, name, photo, all } = useLocalSearchParams<{
    id: string;
    name?: string;
    photo?: string;
    all?: string;
  }>();
  /**
   * Historique COMPLET (`all=1`) ou fiche (défaut) — demande de Berke, 26/09 : la liste
   * entière pouvait être longue, la fiche n'en montre plus que le DERNIER appel, suivi de
   * « Afficher tout l'historique › » qui rouvre ce même écran avec `all=1`. Un seul écran pour
   * les deux : le rendu d'une ligne d'appel n'existe qu'à un endroit.
   */
  const showAll = all === '1';

  const [profile, setProfile] = useState<Profile | null>(null);
  /**
   * ⚠️ Profil introuvable = bloqué ou masqué : le serveur répond 404 dans les deux cas,
   * volontairement. L'historique reste lisible (ce sont nos propres appels), mais aucune
   * action n'est proposée.
   */
  const [hidden, setHidden] = useState(false);
  const [calls, setCalls] = useState<CallItem[] | null>(null);

  useEffect(() => {
    apiRequest<Profile>(`/users/${id}/profile`)
      .then(setProfile)
      .catch(() => setHidden(true));
  }, [id]);

  const loadCalls = useCallback(async () => {
    try {
      const list = await apiRequest<CallItem[]>(`/calls?peerId=${encodeURIComponent(id)}`);
      /**
       * ⚠️ Refiltré ICI aussi : un serveur pas encore mis à jour ignore `peerId` et renvoie
       * TOUS les appels. Sans ce filtre, la fiche d'Alice afficherait les appels avec Bob le
       * temps du déploiement.
       */
      setCalls(list.filter((x) => x.peer.id === id));
    } catch {
      setCalls([]);
    }
  }, [id]);

  // Au focus : on revient souvent sur la fiche juste après avoir rappelé depuis elle.
  useFocusEffect(
    useCallback(() => {
      loadCalls();
    }, [loadCalls]),
  );

  // La photo du profil est filtrée par sa confidentialité ; celle passée en paramètre ne
  // sert qu'à ne pas afficher un en-tête vide pendant le chargement.
  const displayName = profile?.name ?? name ?? '';
  const displayPhoto = profile ? profile.photoUrl : photo || null;

  const call = async () => {
    const r = await startCall({ id, name: displayName, photoUrl: displayPhoto });
    if (r.ok) return;
    Alert.alert(
      '',
      r.reason === 'busy'
        ? t('calls.peer_busy')
        : r.reason === 'refused'
          ? t('details.call_unavailable')
          : t('calls.failed'),
    );
  };

  const message = async () => {
    try {
      const conv = await apiRequest<{ id: string }>('/conversations/direct', {
        method: 'POST',
        body: { targetUserId: id },
      });
      router.push({
        pathname: '/chat/[id]' as any,
        params: { id: conv.id, name: displayName, photo: displayPhoto ?? '' },
      });
    } catch {
      Alert.alert('', t('error'));
    }
  };

  const actions: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    enabled: boolean;
    onPress: () => void;
  }[] = [
    {
      key: 'message',
      icon: 'chatbubble',
      label: t('calls.action_message'),
      enabled: !!profile?.canMessage,
      onPress: message,
    },
    {
      key: 'call',
      icon: 'call',
      label: t('calls.action_call'),
      enabled: !!profile?.canCall,
      onPress: call,
    },
    {
      key: 'profile',
      icon: 'person',
      label: t('calls.action_profile'),
      enabled: !!profile,
      onPress: () => router.push({ pathname: '/user/[id]' as any, params: { id } }),
    },
  ];

  // Regroupement par jour, comme la fiche d'iOS : la liste arrive déjà triée du plus récent
  // au plus ancien, il suffit de couper à chaque changement de date.
  const days: { key: string; heading: string; items: CallItem[] }[] = [];
  for (const item of showAll ? (calls ?? []) : (calls ?? []).slice(0, 1)) {
    const key = new Date(item.createdAt).toDateString();
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(item);
    else days.push({ key, heading: formatDayHeading(item.createdAt, t), items: [item] });
  }

  return (
    // Fond gris et cartes blanches, comme le panneau de détails : `c.card` vaut le même blanc
    // que le fond en thème clair, des cartes posées dessus seraient invisibles.
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-950">
      <View className="flex-row items-center px-2 py-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel={t('calls.back')}
        >
          <Ionicons name="chevron-back" size={26} color={c.nexa} />
        </TouchableOpacity>
        {showAll && (
          <Text className="text-lg font-semibold ml-1 flex-1" style={{ color: c.content }} numberOfLines={1}>
            {displayName}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {!showAll && (
          <View className="items-center px-6 pb-6">
            <UserAvatar name={displayName} photoUrl={displayPhoto} size={96} />
            <Text
              className="text-2xl font-bold mt-3 text-center"
              style={{ color: c.content }}
              numberOfLines={2}
            >
              {displayName}
            </Text>
          </View>
        )}

        {!hidden && !showAll && (
          <View className="flex-row px-4 mb-6" style={{ gap: 10 }}>
            {actions.map((a) => (
              <TouchableOpacity
                key={a.key}
                onPress={a.onPress}
                disabled={!a.enabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !a.enabled }}
                className="flex-1 items-center py-3 bg-white dark:bg-zinc-900"
                style={[CARD_SHADOW, ROUND.bubble, { opacity: a.enabled ? 1 : 0.4 }]}
              >
                <Ionicons name={a.icon} size={22} color={c.nexa} />
                <Text className="text-xs font-medium mt-1" style={{ color: c.nexa }}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text className="text-lg font-bold px-4 mb-2" style={{ color: c.content }}>
          {showAll ? t('calls.history') : t('calls.last_call')}
        </Text>

        {calls === null ? (
          <ActivityIndicator color={NEXA} className="mt-6" />
        ) : calls.length === 0 ? (
          <Text className="px-4" style={{ color: c.muted }}>
            {t('calls.no_calls_with')}
          </Text>
        ) : (
          <View className="mx-4 bg-white dark:bg-zinc-900" style={[CARD_SHADOW, ROUND.bubble]}>
            {days.map((day, di) => (
              <View key={day.key}>
                <Text
                  className="text-sm font-semibold px-4 pt-3 pb-1"
                  style={{ color: c.content, borderTopWidth: di ? 1 : 0, borderTopColor: c.line }}
                >
                  {day.heading}
                </Text>
                {day.items.map((item) => (
                  <View key={item.id} className="flex-row items-center px-4 py-2">
                    <Text style={{ color: c.muted, fontSize: 15, width: 56 }}>
                      {formatTime(item.createdAt)}
                    </Text>
                    <Ionicons
                      name={callIcon(item)}
                      size={14}
                      color={item.missed ? MISSED_COLOR : c.muted}
                    />
                    <Text
                      className="flex-1 ml-1"
                      numberOfLines={1}
                      style={{ color: item.missed ? MISSED_COLOR : c.content, fontSize: 15 }}
                    >
                      {callLabel(item, t)}
                    </Text>
                    {item.duration ? (
                      <Text style={{ color: c.muted, fontSize: 15 }}>{formatDuration(item.duration)}</Text>
                    ) : null}
                  </View>
                ))}
                <View style={{ height: 8 }} />
              </View>
            ))}
          </View>
        )}

        {/* Le lien n'a de sens que s'il y a plus que le dernier appel à montrer. */}
        {!showAll && !!calls && calls.length > 1 && (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/calls/[id]' as any,
                params: { id, name: displayName, photo: displayPhoto ?? '', all: '1' },
              })
            }
            accessibilityRole="button"
            className="flex-row items-center justify-between mx-4 mt-3 px-4 py-3 bg-white dark:bg-zinc-900"
            style={[CARD_SHADOW, ROUND.bubble]}
          >
            <Text className="text-base font-medium" style={{ color: c.nexa }}>
              {t('calls.show_all_history')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={c.nexa} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
