import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { apiRequest } from '../../lib/api';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../../lib/i18n';
import { clearTokens } from '../../lib/storage';
import { disconnectSocket } from '../../lib/socket';

const NEXA = '#128C7E';

// Même ressort que le drawer « Vu par » des stories : rapide, sans rebond.
const SHEET_SPRING = {
  damping: 24,
  stiffness: 220,
  mass: 0.7,
  overshootClamping: true,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type User = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  kvkkConsent: boolean;
  language: string;
};

// Ligne de réglage générique (icône + label + valeur/flèche)
function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-4"
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: danger ? '#FEE2E2' : '#D1FAE5' }}
      >
        <Ionicons name={icon} size={20} color={danger ? '#EF4444' : NEXA} />
      </View>
      <Text
        className={`ml-3 flex-1 text-base ${danger ? 'text-red-500 font-semibold' : 'text-gray-900'}`}
      >
        {label}
      </Text>
      {value ? <Text className="text-gray-400 mr-1">{value}</Text> : null}
      {onPress && !danger ? (
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      ) : null}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [nameModal, setNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [langMounted, setLangMounted] = useState(false); // monte le Modal le temps de l'anim
  const sheetY = useSharedValue(1000); // translateY du drawer (0 = ouvert, hauteur = caché)
  const sheetH = useSharedValue(1000); // hauteur mesurée du drawer
  const openedRef = useRef(false);

  const finalizeClose = () => {
    setLangMounted(false);
    openedRef.current = false;
  };

  const openLang = () => {
    sheetY.value = 1000; // hors écran avant la mesure
    openedRef.current = false;
    setLangMounted(true);
  };

  // Mesure la hauteur réelle du drawer, puis l'anime du bas vers sa position ouverte.
  const onSheetLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    sheetH.value = h;
    if (!openedRef.current) {
      openedRef.current = true;
      sheetY.value = h;
      sheetY.value = withSpring(0, SHEET_SPRING);
    }
  };

  const closeLang = () => {
    sheetY.value = withSpring(sheetH.value, SHEET_SPRING, (finished) => {
      if (finished) runOnJS(finalizeClose)();
    });
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - sheetY.value / sheetH.value) * 0.55,
  }));

  // Drag : le drawer suit le doigt vers le bas, aimantation fermé/ouvert au relâcher.
  const sheetPan = Gesture.Pan()
    .onUpdate((e) => {
      sheetY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose = e.velocityY > 300 || sheetY.value > sheetH.value * 0.4;
      if (shouldClose) {
        sheetY.value = withSpring(sheetH.value, SHEET_SPRING, (finished) => {
          if (finished) runOnJS(finalizeClose)();
        });
      } else {
        sheetY.value = withSpring(0, SHEET_SPRING);
      }
    });

  useEffect(() => {
    apiRequest<User>('/users/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert(t('logout_confirm_title'), t('logout_confirm_message'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          disconnectSocket();
          await clearTokens();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const handleChangePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await apiRequest<{
        uploadUrl: string;
        publicUrl: string;
      }>('/upload/presigned-url', {
        method: 'POST',
        body: { contentType: 'image/jpeg' },
      });

      const blob = await fetch(asset.uri).then((r) => r.blob());
      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!up.ok) throw new Error('upload');

      await apiRequest('/users/me', {
        method: 'PATCH',
        body: { photoUrl: publicUrl },
      });
      setUser((u) => (u ? { ...u, photoUrl: publicUrl } : u));
    } catch {
      Alert.alert(t('error'), t('photo_error'));
    } finally {
      setUploading(false);
    }
  };

  const openNameModal = () => {
    setNameDraft(user?.name ?? '');
    setNameError('');
    setNameModal(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError(t('name_required'));
      return;
    }
    if (trimmed.length < 2) {
      setNameError(t('name_too_short'));
      return;
    }
    setSavingName(true);
    try {
      await apiRequest('/users/me', { method: 'PATCH', body: { name: trimmed } });
      setUser((u) => (u ? { ...u, name: trimmed } : u));
      setNameModal(false);
    } catch (e: any) {
      setNameError(e.message || t('error'));
    } finally {
      setSavingName(false);
    }
  };

  const selectLanguage = async (code: string) => {
    closeLang();
    if (code === user?.language) return;
    await setAppLanguage(code);
    setUser((u) => (u ? { ...u, language: code } : u));
    apiRequest('/users/me', { method: 'PATCH', body: { language: code } }).catch(
      () => {},
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={NEXA} />
      </View>
    );
  }

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === user?.language);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
      <View className="px-5 py-3 bg-white">
        <Text className="text-2xl font-bold" style={{ color: NEXA }}>
          {t('profile')}
        </Text>
      </View>

      {/* Carte profil */}
      <View className="items-center bg-white pt-6 pb-8 mb-3">
        <TouchableOpacity
          onPress={handleChangePhoto}
          activeOpacity={0.8}
          disabled={uploading}
        >
          <View className="w-28 h-28 rounded-full overflow-hidden items-center justify-center bg-emerald-50">
            {user?.photoUrl ? (
              <Image
                source={{ uri: user.photoUrl }}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <Text className="text-5xl font-bold" style={{ color: NEXA }}>
                {user?.name?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            )}
            {uploading && (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color="white" />
              </View>
            )}
          </View>
          <View
            className="absolute bottom-0 right-0 w-9 h-9 rounded-full items-center justify-center border-2 border-white"
            style={{ backgroundColor: NEXA }}
          >
            <Ionicons name="camera" size={18} color="white" />
          </View>
        </TouchableOpacity>

        <View className="flex-row items-center mt-4">
          <Text className="text-2xl font-bold text-gray-900">{user?.name}</Text>
          <TouchableOpacity className="ml-2 p-1" onPress={openNameModal}>
            <Ionicons name="pencil" size={18} color={NEXA} />
          </TouchableOpacity>
        </View>
        <Text className="text-gray-500 mt-1">{user?.phone}</Text>
      </View>

      {/* Réglages */}
      <View className="bg-white">
        <Text className="px-4 pt-4 pb-1 text-xs font-semibold uppercase text-gray-400">
          {t('settings')}
        </Text>
        <SettingRow
          icon="language-outline"
          label={t('language')}
          value={currentLang ? `${currentLang.flag} ${currentLang.label}` : ''}
          onPress={openLang}
        />
        <View className="h-px bg-gray-100 ml-16" />
        <SettingRow
          icon="shield-checkmark-outline"
          label={t('kvkk_title')}
          value={user?.kvkkConsent ? t('kvkk_accepted') : t('kvkk_not_accepted')}
        />
      </View>

      <View className="bg-white mt-3">
        <SettingRow
          icon="log-out-outline"
          label={t('logout')}
          onPress={handleLogout}
          danger
        />
      </View>

      {/* Modal édition du nom */}
      <Modal visible={nameModal} transparent animationType="fade">
        <Pressable
          className="flex-1 justify-center items-center bg-black/40 px-8"
          onPress={() => setNameModal(false)}
        >
          <Pressable className="w-full bg-white rounded-2xl p-5" onPress={() => {}}>
            <Text className="text-lg font-bold text-gray-900 mb-3">
              {t('edit_profile')}
            </Text>
            <TextInput
              className={`border rounded-xl px-4 py-3 text-lg ${nameError ? 'border-red-400' : 'border-gray-300'}`}
              placeholder={t('your_name')}
              placeholderTextColor="#9CA3AF"
              value={nameDraft}
              onChangeText={(v) => {
                setNameDraft(v);
                setNameError('');
              }}
              autoFocus
              maxLength={40}
            />
            {nameError ? (
              <Text className="text-red-500 text-sm mt-1 ml-1">{nameError}</Text>
            ) : null}
            <View className="flex-row justify-end gap-3 mt-4">
              <TouchableOpacity
                className="px-4 py-2"
                onPress={() => setNameModal(false)}
              >
                <Text className="text-gray-500 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-5 py-2 rounded-full"
                style={{ backgroundColor: NEXA }}
                onPress={saveName}
                disabled={savingName}
              >
                {savingName ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white font-semibold">{t('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Drawer sélection de langue — même animation que le drawer « Vu par » des stories */}
      <Modal visible={langMounted} transparent animationType="none" onRequestClose={closeLang}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 justify-end">
            <AnimatedPressable
              className="absolute inset-0 bg-black"
              style={backdropStyle}
              onPress={closeLang}
            />
            <Animated.View
              onLayout={onSheetLayout}
              style={sheetStyle}
              className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl pb-8 pt-3"
            >
              <GestureDetector gesture={sheetPan}>
                <View className="pb-2">
                  <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-3" />
                  <Text className="text-lg font-bold text-gray-900 px-5">
                    {t('language')}
                  </Text>
                </View>
              </GestureDetector>
              {SUPPORTED_LANGUAGES.map((l) => {
                const active = l.code === user?.language;
                return (
                  <TouchableOpacity
                    key={l.code}
                    className="flex-row items-center px-5 py-4"
                    onPress={() => selectLanguage(l.code)}
                  >
                    <Text className="text-2xl mr-3">{l.flag}</Text>
                    <Text
                      className={`flex-1 text-base ${active ? 'font-bold' : 'text-gray-900'}`}
                      style={active ? { color: NEXA } : undefined}
                    >
                      {l.label}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark-circle" size={22} color={NEXA} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}
