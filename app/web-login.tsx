import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QrScanner, { type ScanOrigin } from '../components/QrScanner';
import { apiRequest } from '../lib/api';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';

const NEXA = '#1E40AF';

type Peek = { userAgent: string | null; createdAt: string };

/**
 * Connexion de Nexa Web : on scanne le QR affiché par le navigateur, on confirme, on approuve.
 *
 * ⚠️ La CONFIRMATION n'est pas une politesse. Scanner un QR ne doit jamais suffire à ouvrir
 * une session : un code affiché n'importe où — un site, une affiche, l'écran de quelqu'un
 * d'autre — donnerait sinon accès à toute la messagerie de qui le scanne. On montre donc ce
 * qu'on s'apprête à autoriser (le navigateur), et on demande un geste explicite.
 */
export default function WebLoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [scanning, setScanning] = useState(false);
  /**
   * Point de départ de l'animation « magic move » du scanner.
   *
   * ⚠️ `QrScanner` l'exige : il s'ouvre en grandissant depuis le bouton qui l'a déclenché.
   * Sans mesure réelle, l'ouverture partirait du coin haut-gauche de l'écran.
   */
  const [origin, setOrigin] = useState<ScanOrigin>({ x: 0, y: 0, w: 1, h: 1 });
  const scanBtnRef = useRef<View>(null);

  const openScanner = () => {
    scanBtnRef.current?.measureInWindow?.((x, y, w, h) => setOrigin({ x, y, w, h }));
    setScanning(true);
  };
  const [pending, setPending] = useState<{ token: string; peek: Peek } | null>(null);
  const [busy, setBusy] = useState(false);

  /** Le QR est lu : on demande au serveur CE QU'IL représente avant de proposer d'approuver. */
  const onScanned = async (token: string) => {
    setBusy(true);
    try {
      const peek = await apiRequest<Peek>(`/web-sessions/${encodeURIComponent(token)}`);
      setPending({ token, peek });
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiRequest('/web-sessions/approve', {
        method: 'POST',
        body: { token: pending.token },
      });
      setPending(null);
      Alert.alert(t('web_login.done_title'), t('web_login.done_body'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10} className="pr-3 py-1">
          <Ionicons name="chevron-back" size={26} color={colors.content} />
        </Pressable>
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
          {t('web_login.title')}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <View className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center mb-6">
          <Ionicons name="laptop-outline" size={38} color={NEXA} />
        </View>

        {pending ? (
          <>
            <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 text-center">
              {t('web_login.confirm_title')}
            </Text>
            {/* On montre le navigateur : c'est le seul repère qui permet de reconnaître SA
                propre demande, et donc d'écarter celle de quelqu'un d'autre. */}
            {!!pending.peek.userAgent && (
              <Text className="text-sm text-gray-500 dark:text-zinc-400 text-center mt-2">
                {pending.peek.userAgent}
              </Text>
            )}
            <Text className="text-sm text-gray-400 dark:text-zinc-500 text-center mt-3">
              {t('web_login.confirm_hint')}
            </Text>

            <Pressable
              onPress={approve}
              disabled={busy}
              style={ROUND.bubble}
              className="bg-nexa px-8 py-3.5 mt-7 flex-row items-center"
            >
              {busy && <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />}
              <Text className="text-white font-semibold text-base">
                {t('web_login.approve')}
              </Text>
            </Pressable>
            <Pressable onPress={() => setPending(null)} className="mt-3 py-2">
              <Text className="text-gray-500 dark:text-zinc-400">{t('cancel')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 text-center">
              {t('web_login.intro_title')}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-zinc-400 text-center mt-2">
              {t('web_login.intro_body')}
            </Text>
            <Pressable
              ref={scanBtnRef}
              onPress={openScanner}
              disabled={busy}
              style={ROUND.bubble}
              className="bg-nexa px-8 py-3.5 mt-7 flex-row items-center"
            >
              {busy ? (
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="qr-code-outline" size={18} color="white" style={{ marginRight: 8 }} />
              )}
              <Text className="text-white font-semibold text-base">{t('web_login.scan')}</Text>
            </Pressable>
          </>
        )}
      </View>

      <QrScanner
        visible={scanning}
        origin={origin}
        onClose={() => setScanning(false)}
        onWebSession={onScanned}
      />
    </SafeAreaView>
  );
}
