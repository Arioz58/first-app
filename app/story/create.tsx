import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../../lib/api';

type PickedMedia = { uri: string; mimeType: string; width: number; height: number };

export default function CreateStoryScreen() {
  const router = useRouter();
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [loading, setLoading] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerW = useSharedValue(0);
  const containerH = useSharedValue(0);

  const clampTranslation = (s: number) => {
    'worklet';
    const maxX = Math.max(0, (containerW.value * (s - 1)) / 2);
    const maxY = Math.max(0, (containerH.value * (s - 1)) / 2);
    translateX.value = withSpring(Math.max(-maxX, Math.min(maxX, translateX.value)));
    translateY.value = withSpring(Math.max(-maxY, Math.min(maxY, translateY.value)));
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  };

  const resetTransform = () => {
    'worklet';
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    savedTranslateX.value = 0;
    translateY.value = withSpring(0);
    savedTranslateY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      clampTranslation(scale.value);
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onBegin(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      const maxX = Math.max(0, (containerW.value * (scale.value - 1)) / 2);
      const maxY = Math.max(0, (containerH.value * (scale.value - 1)) / 2);
      translateX.value = Math.max(-maxX, Math.min(maxX, savedTranslateX.value + e.translationX));
      translateY.value = Math.max(-maxY, Math.min(maxY, savedTranslateY.value + e.translationY));
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => resetTransform());

  // Race : le double tap est prioritaire, sinon pinch+pan s'activent
  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinchGesture, panGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const onContainerLayout = (e: LayoutChangeEvent) => {
    containerW.value = e.nativeEvent.layout.width;
    containerH.value = e.nativeEvent.layout.height;
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "L'accès à la galerie est nécessaire.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      resetTransform();
      setMedia({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });
    }
  };

  const handlePublish = async () => {
    if (!media) return;
    setLoading(true);
    try {
      const isVideo = media.mimeType.startsWith('video/');
      let finalUri = media.uri;

      if (!isVideo) {
        const imgW = media.width;
        const imgH = media.height;
        const W = containerW.value;
        const H = containerH.value;
        const s = scale.value;
        const tx = translateX.value;
        const ty = translateY.value;

        const fitScale = Math.min(W / imgW, H / imgH);
        const rW = imgW * fitScale;
        const rH = imgH * fitScale;

        // Région visible dans l'espace local (centré sur la vue)
        const visLeft = Math.max(-rW / 2, (-W / 2 - tx) / s);
        const visRight = Math.min(rW / 2, (W / 2 - tx) / s);
        const visTop = Math.max(-rH / 2, (-H / 2 - ty) / s);
        const visBottom = Math.min(rH / 2, (H / 2 - ty) / s);

        // Conversion en pixels de l'image originale
        const originX = Math.round(Math.max(0, (visLeft + rW / 2) / fitScale));
        const originY = Math.round(Math.max(0, (visTop + rH / 2) / fitScale));
        const cropW = Math.round(Math.min(imgW - originX, (visRight - visLeft) / fitScale));
        const cropH = Math.round(Math.min(imgH - originY, (visBottom - visTop) / fitScale));

        const result = await ImageManipulator.manipulateAsync(
          media.uri,
          [{ crop: { originX, originY, width: cropW, height: cropH } }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
        );
        finalUri = result.uri;
      }

      const contentType = isVideo ? media.mimeType : 'image/jpeg';

      const { uploadUrl, publicUrl } = await apiRequest<{
        uploadUrl: string;
        publicUrl: string;
      }>('/upload/presigned-url', {
        method: 'POST',
        body: { contentType },
      });

      const fileBlob = await fetch(finalUri).then((r) => r.blob());
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: fileBlob,
      });

      if (!uploadRes.ok) throw new Error("Échec de l'upload S3");

      await apiRequest('/stories', {
        method: 'POST',
        body: { mediaUrl: publicUrl },
      });

      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const isVideo = media?.mimeType.startsWith('video/');

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold flex-1">
          Nouvelle story
        </Text>
        {media && (
          <TouchableOpacity onPress={handlePublish} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <View className="bg-nexa px-4 py-2 rounded-full">
                <Text className="text-white font-semibold">Publier</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {media ? (
        <View
          style={{ flex: 1, overflow: 'hidden' }}
          onLayout={onContainerLayout}
        >
          <GestureDetector gesture={composed}>
            <Reanimated.View style={[{ flex: 1 }, animatedStyle]}>
              <Image
                source={{ uri: media.uri }}
                style={{ flex: 1 }}
                resizeMode="contain"
              />
              {isVideo && (
                <View className="absolute inset-0 items-center justify-center">
                  <Ionicons name="videocam" size={48} color="white" />
                </View>
              )}
            </Reanimated.View>
          </GestureDetector>

          <View className="absolute bottom-8 left-0 right-0 items-center gap-2">
            <Text className="text-white/40 text-xs">
              Glisse · Pince · Double tap pour réinitialiser
            </Text>
            <TouchableOpacity
              className="bg-white/20 border border-white/40 rounded-full px-8 py-3"
              onPress={pickMedia}
            >
              <Text className="text-white font-medium">Changer</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          className="flex-1 items-center justify-center gap-4"
          onPress={pickMedia}
          activeOpacity={0.8}
        >
          <View className="w-24 h-24 rounded-full bg-white/10 items-center justify-center">
            <Ionicons name="image-outline" size={40} color="white" />
          </View>
          <Text className="text-white text-lg font-medium">
            Choisir une photo ou vidéo
          </Text>
          <Text className="text-white/50 text-sm">
            Elle sera visible pendant 24h
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
