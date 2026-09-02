import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WIN = Dimensions.get('window');
const SIZE = Math.min(WIN.width * 0.82, 340); // côté du carré scanner ouvert
const TARGET_LEFT = (WIN.width - SIZE) / 2;
const TARGET_TOP = (WIN.height - SIZE) / 2 - 24; // un peu au-dessus du centre

export type ScanOrigin = { x: number; y: number; w: number; h: number };

const parseUserId = (raw: string): string | null => {
  const m = raw.match(/user\/([A-Za-z0-9-]+)/);
  return m ? m[1] : null;
};

type Status = 'idle' | 'success' | 'error';

export default function QrScanner({
  visible,
  origin,
  onClose,
  onWebSession,
}: {
  visible: boolean;
  origin: ScanOrigin;
  onClose: () => void;
  /**
   * Connexion à Nexa Web : appelé avec le jeton scanné au lieu d'ouvrir un profil.
   *
   * ⚠️ Sa présence change ce que le scanner ACCEPTE — un QR de profil n'a rien à faire dans
   * un écran « connecter Nexa Web », et l'inverse est vrai aussi. Deux QR différents, deux
   * lectures différentes, jamais les deux à la fois.
   */
  onWebSession?: (token: string) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>('idle');
  const [torch, setTorch] = useState(false);
  const handledRef = useRef(false);
  const busyRef = useRef(false);

  const progress = useSharedValue(0); // 0 = replié sur le bouton, 1 = carré ouvert
  const scale = useSharedValue(1); // pulse succès
  const shake = useSharedValue(0); // secousse erreur
  const scanY = useSharedValue(0); // ligne de scan

  // Géométrie du « magic move » : le carré (fixe à SIZE) est ramené visuellement
  // sur le bouton via translate + scale, puis déplié.
  const cx = TARGET_LEFT + SIZE / 2;
  const cy = TARGET_TOP + SIZE / 2;
  const tx0 = origin.x + origin.w / 2 - cx;
  const ty0 = origin.y + origin.h / 2 - cy;
  const scale0 = origin.w / SIZE;
  const radius0 = (12 * SIZE) / origin.w; // pour un arrondi visuel ~12 replié

  useEffect(() => {
    if (visible) {
      handledRef.current = false;
      busyRef.current = false;
      setStatus('idle');
      setTorch(false);
      progress.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) });
      scanY.value = withRepeat(
        withTiming(SIZE - 35, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      if (!permission?.granted && permission?.canAskAgain) requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    progress.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(onClose)();
    });
  };

  const boxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [tx0, 0]) },
      { translateY: interpolate(progress.value, [0, 1], [ty0, 0]) },
      { scale: interpolate(progress.value, [0, 1], [scale0, 1]) * scale.value },
    ],
    borderRadius: interpolate(progress.value, [0, 1], [radius0, 28]),
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 1], [0, 0.72]) }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.55, 1], [0, 1]) }));
  const frameStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1]),
    transform: [{ translateX: shake.value }],
  }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scanY.value }] }));

  const onScanned = ({ data }: { data: string }) => {
    if (handledRef.current || busyRef.current) return;
    /**
     * ⚠️ En mode « connexion web », on ACCEPTE le jeton tel quel — c'est une chaîne opaque
     * générée par le serveur, pas une URL. On se contente d'écarter ce qui est visiblement
     * autre chose (un lien, un texte trop court) : le serveur reste seul juge de sa validité.
     */
    if (onWebSession) {
      const token = data.trim();
      const plausible = token.length >= 20 && !token.includes('://') && !token.includes(' ');
      if (!plausible) {
        busyRef.current = true;
        setStatus('error');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => {
          setStatus('idle');
          busyRef.current = false;
        }, 1500);
        return;
      }
      handledRef.current = true;
      setStatus('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        onClose();
        onWebSession(token);
      }, 300);
      return;
    }

    const id = parseUserId(data);
    if (!id) {
      busyRef.current = true;
      setStatus('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      shake.value = withSequence(
        withTiming(-8, { duration: 45 }),
        withTiming(8, { duration: 90 }),
        withTiming(-6, { duration: 90 }),
        withTiming(0, { duration: 60 }),
      );
      setTimeout(() => {
        setStatus('idle');
        busyRef.current = false;
      }, 1500);
      return;
    }
    handledRef.current = true;
    setStatus('success');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value = withSequence(withTiming(1.06, { duration: 140 }), withTiming(1, { duration: 160 }));
    setTimeout(() => {
      onClose();
      router.push({ pathname: '/user/[id]' as any, params: { id } });
    }, 400);
  };

  const cornerColor = status === 'success' ? '#22C55E' : status === 'error' ? '#EF4444' : '#FFFFFF';
  const granted = permission?.granted;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Fond assombri, tap pour fermer */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Le carré caméra qui naît du bouton */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: TARGET_TOP,
            left: TARGET_LEFT,
            width: SIZE,
            height: SIZE,
            overflow: 'hidden',
            backgroundColor: '#000',
          },
          boxStyle,
        ]}
      >
        {granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
            {/* Coins en L + ligne de scan */}
            <Animated.View style={[StyleSheet.absoluteFill, frameStyle]}>
              <View style={[styles.corner, styles.tl, { borderColor: cornerColor }]} />
              <View style={[styles.corner, styles.tr, { borderColor: cornerColor }]} />
              <View style={[styles.corner, styles.bl, { borderColor: cornerColor }]} />
              <View style={[styles.corner, styles.br, { borderColor: cornerColor }]} />
              {status === 'idle' && (
                <Animated.View style={[styles.line, lineStyle]}>
                  <LinearGradient
                    colors={['transparent', '#3B82F6', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1, borderRadius: 2 }}
                  />
                </Animated.View>
              )}
            </Animated.View>
          </>
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <Ionicons name="camera-outline" size={40} color="#9CA3AF" />
            <Text className="text-gray-300 text-center text-sm mt-3 mb-4">{t('scan.permission')}</Text>
            <TouchableOpacity
              className="bg-nexa rounded-full px-5 py-2"
              onPress={() => (permission?.canAskAgain ? requestPermission() : Linking.openSettings())}
            >
              <Text className="text-white font-semibold">{t('scan.allow')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* Chrome (titre, consigne, torche) — apparaît une fois le carré ouvert */}
      <Animated.View style={[StyleSheet.absoluteFill, chromeStyle]} pointerEvents="box-none">
        <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16 }} className="flex-row items-center">
          <Text className="text-white text-lg font-semibold flex-1">{t('scan.title')}</Text>
          <TouchableOpacity onPress={close} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ position: 'absolute', top: TARGET_TOP + SIZE + 28, left: 0, right: 0 }} className="items-center">
          <Text className="text-white text-center text-base px-10 mb-6">
            {status === 'error' ? t('scan.not_recognized') : t('scan.hint')}
          </Text>
          {granted && (
            <TouchableOpacity
              onPress={() => setTorch((v) => !v)}
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: torch ? '#fff' : 'rgba(255,255,255,0.18)' }}
            >
              <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={24} color={torch ? '#111827' : '#fff'} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Coins en retrait (INSET) pour ne pas être rognés par l'arrondi du carré (overflow hidden).
  corner: { position: 'absolute', width: 30, height: 30 },
  tl: { top: 16, left: 16, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  tr: { top: 16, right: 16, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bl: { bottom: 16, left: 16, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: 16, right: 16, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  line: { position: 'absolute', left: 16, right: 16, top: 16, height: 3 },
});
