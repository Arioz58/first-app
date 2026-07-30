import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddContactSheet from '../../components/AddContactSheet';
import { DirectoryPanel } from '../../components/DirectoryPanel';
import { FriendsPanel } from '../../components/FriendsPanel';
import QrScanner, { ScanOrigin } from '../../components/QrScanner';
import { usePendingFriendRequests } from '../../lib/friendRequests';
import { consumeContactsSegment } from '../../lib/tabsNav';

export default function SearchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [seg, setSeg] = useState<'directory' | 'friends'>('directory');
  const pendingRequests = usePendingFriendRequests();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanOrigin, setScanOrigin] = useState<ScanOrigin>({ x: 0, y: 0, w: 44, h: 44 });
  const scanBtnRef = useRef<View>(null);

  // Le bouton scan est dans le header (pas dans un Modal) → ouverture directe.
  const openScan = () => {
    scanBtnRef.current?.measureInWindow((x, y, w, h) => {
      setScanOrigin({ x, y, w, h });
      setScanOpen(true);
    });
  };

  // Le FAB de la page Messages peut demander l'ouverture sur un segment précis.
  useFocusEffect(
    useCallback(() => {
      const requested = consumeContactsSegment();
      if (requested) setSeg(requested);
    }, []),
  );

  const openProfile = (userId: string) => {
    router.push({ pathname: '/user/[id]' as any, params: { id: userId } });
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-3xl font-bold text-nexa">{t('tabs.contacts')}</Text>
          {/* Scanner un QR + ajouter par numéro (uniquement sur le segment Répertoire) */}
          {seg === 'directory' && (
            <View className="flex-row items-center">
              <TouchableOpacity
                ref={scanBtnRef}
                onPress={openScan}
                className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center mr-2"
              >
                <Ionicons name="scan-outline" size={22} color="#1E40AF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSheetOpen(true)}
                className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 items-center justify-center"
              >
                <Ionicons name="add" size={24} color="#1E40AF" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Segmented Répertoire / Amis */}
        <View className="flex-row bg-gray-100 dark:bg-zinc-800 rounded-full p-1">
          {(['directory', 'friends'] as const).map((s) => {
            const active = seg === s;
            const showBadge = s === 'friends' && pendingRequests > 0;
            return (
              <TouchableOpacity
                key={s}
                className={`flex-1 flex-row items-center justify-center py-2 rounded-full ${active ? 'bg-white dark:bg-zinc-900' : ''}`}
                style={active ? { elevation: 1 } : undefined}
                onPress={() => setSeg(s)}
              >
                <Text
                  className={`text-base font-semibold ${active ? 'text-nexa' : 'text-gray-500 dark:text-zinc-400'}`}
                >
                  {s === 'directory' ? t('contacts_sync.tab') : t('friends.title')}
                </Text>
                {showBadge && (
                  <View className="bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1 ml-1.5">
                    <Text className="text-white text-[10px] font-bold">
                      {pendingRequests > 99 ? '99+' : pendingRequests}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {seg === 'friends' ? (
        <FriendsPanel onOpenProfile={openProfile} />
      ) : (
        <DirectoryPanel onOpenProfile={openProfile} />
      )}

      <AddContactSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpenProfile={openProfile}
      />

      <QrScanner visible={scanOpen} origin={scanOrigin} onClose={() => setScanOpen(false)} />
    </SafeAreaView>
  );
}
