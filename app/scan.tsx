import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Extrait l'id de profil d'un lien scanné, quel que soit le scheme
// (nexa://user/<id>, exp://.../--/user/<id>…).
const parseUserId = (raw: string): string | null => {
  const m = raw.match(/user\/([A-Za-z0-9-]+)/);
  return m ? m[1] : null;
};

export default function ScanScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(false);
  const handledRef = useRef(false); // ne traite qu'un seul scan

  const onScanned = ({ data }: { data: string }) => {
    if (handledRef.current) return;
    const id = parseUserId(data);
    if (!id) {
      setError(true);
      // Laisse retenter après 1,5 s (QR non reconnu).
      setTimeout(() => setError(false), 1500);
      return;
    }
    handledRef.current = true;
    router.replace({ pathname: '/user/[id]' as any, params: { id } });
  };

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-white flex-1">{t('scan.title')}</Text>
      </View>

      {!permission ? (
        <View className="flex-1" />
      ) : !permission.granted ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="camera-outline" size={56} color="#9CA3AF" />
          <Text className="text-gray-300 text-center mt-4 mb-6">{t('scan.permission')}</Text>
          <TouchableOpacity
            className="bg-nexa rounded-full px-6 py-3"
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          >
            <Text className="text-white font-semibold">{t('scan.allow')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
          />
          {/* Cadre de visée + consigne, en surimpression */}
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <View
              style={{
                width: 240,
                height: 240,
                borderRadius: 24,
                borderWidth: 3,
                borderColor: error ? '#EF4444' : '#fff',
              }}
            />
            <Text className="text-white text-center mt-6 px-10">
              {error ? t('scan.not_recognized') : t('scan.hint')}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
