import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import StepIndicator from '../components/StepIndicator';
import { registerForPushNotifications } from '../lib/notifications';
import { ROUND } from '../lib/radius';
import { requestContactsSegment } from '../lib/tabsNav';
import { useThemeColors } from '../lib/theme';

/**
 * Dernière étape de l'inscription : ce que l'app demandera, et pourquoi.
 *
 * ⚠️ Écran EXPLICATIF, pas un écran de collecte. Il ne déclenche AUCUNE boîte de dialogue
 * système, à une exception près (les notifications, voir plus bas). Les autorisations
 * restent demandées au moment de l'usage.
 *
 * Trois raisons, dans l'ordre d'importance :
 *
 * 1. ⚠️ UNE PERMISSION REFUSÉE NE PEUT PLUS ÊTRE REDEMANDÉE. iOS et Android n'affichent
 *    plus jamais la boîte de dialogue ; il faut passer par les Réglages. Demander la caméra
 *    ici, avant que l'utilisateur ait vu à quoi elle sert, revient à maximiser les refus et
 *    à condamner la fonction avant qu'elle ait été découverte.
 * 2. ⚠️ La règle 5.1.1 de l'App Review demande de solliciter une autorisation AU MOMENT où
 *    la fonction l'exige. Un écran qui réclame tout au lancement est un motif de rejet
 *    documenté, côté Apple comme côté Google Play.
 * 3. Le consentement RGPD/KVKK se veut spécifique et éclairé : grouper plusieurs finalités
 *    dans une même demande en dégrade la qualité — ce qui compte surtout pour les CONTACTS,
 *    où l'on traite les numéros de tiers qui n'ont rien accepté.
 *
 * ⚠️ EXCEPTION, les notifications : demandées ici parce qu'elles servent immédiatement (on
 * vient de créer un compte pour recevoir des messages) et qu'aucun autre moment ne se
 * présente — attendre le premier message reçu, c'est l'avoir déjà manqué.
 *
 * ⚠️ À LA RACINE et non dans `(auth)` : le layout racine renvoie vers `/(tabs)` tout
 * utilisateur authentifié qui se trouve dans ce groupe, et à ce stade le compte existe déjà.
 * L'indicateur d'étape est donc rendu ici, la barre du groupe `(auth)` n'étant plus montée.
 *
 * ⚠️ Les CONTACTS ne sont pas demandés ici non plus : le bouton mène au répertoire, qui
 * porte déjà son écran de pré-consentement. Le doubler ici afficherait deux demandes pour
 * une seule décision.
 */

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  key: 'camera' | 'photos' | 'location' | 'contacts' | 'notif';
  /** Seule celle-ci déclenche une vraie demande, et c'est dit à l'utilisateur. */
  now?: boolean;
};

const ROWS: Row[] = [
  { icon: 'notifications', key: 'notif', now: true },
  { icon: 'camera', key: 'camera' },
  { icon: 'images', key: 'photos' },
  { icon: 'location', key: 'location' },
  { icon: 'people', key: 'contacts' },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const enter = async (goToContacts: boolean) => {
    if (busy) return;
    setBusy(true);
    /**
     * ⚠️ L'échec n'arrête RIEN : un refus des notifications est un choix, pas une erreur, et
     * bloquer l'entrée dans l'app dessus serait une façon de forcer la main.
     */
    await registerForPushNotifications().catch(() => null);
    if (goToContacts) {
      // Relais mémoire : un paramètre de route ne se redéclencherait pas au 2ᵉ passage.
      requestContactsSegment('directory');
    }
    router.replace('/(tabs)');
  };

  return (
    <View className="flex-1 bg-white dark:bg-zinc-950">
      <View style={{ paddingTop: insets.top }}>
        <StepIndicator currentStep={6} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 8 }}>
        <Text className="text-3xl font-bold text-gray-900 dark:text-zinc-100">
          {t('permissions.title')}
        </Text>
        <Text className="mt-2 text-lg text-gray-500 dark:text-zinc-400">
          {t('permissions.subtitle')}
        </Text>

        <View className="mt-6">
          {ROWS.map((r) => (
            <View key={r.key} className="flex-row mb-5">
              <View className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center mr-4">
                <Ionicons name={r.icon} size={22} color={colors.nexa} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                  {t(`permissions.${r.key}_title`)}
                </Text>
                <Text className="text-base text-gray-500 dark:text-zinc-400 mt-0.5">
                  {t(`permissions.${r.key}_desc`)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Le droit de retrait, dit explicitement : une autorisation qu'on croit définitive
            se refuse plus volontiers qu'une autorisation qu'on sait révocable. */}
        <Text className="text-base text-gray-400 dark:text-zinc-500">
          {t('permissions.revoke')}
        </Text>
      </ScrollView>

      <View style={{ padding: 24, paddingBottom: Math.max(insets.bottom, 16) }}>
        <TouchableOpacity
          disabled={busy}
          onPress={() => void enter(false)}
          style={ROUND.inner}
          className="bg-nexa py-4 items-center"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-lg font-semibold">{t('permissions.continue')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          disabled={busy}
          onPress={() => void enter(true)}
          className="py-4 items-center"
        >
          <Text className="text-lg font-semibold text-nexa">
            {t('permissions.find_friends')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
