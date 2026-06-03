import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TextInput,
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
  const [overlayText, setOverlayText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);
  const containerRef = useRef<View>(null);

  // Transforms image
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerW = useSharedValue(0);
  const containerH = useSharedValue(0);

  // Position du texte (offset depuis le centre de la vue)
  const textX = useSharedValue(0);
  const savedTextX = useSharedValue(0);
  const textY = useSharedValue(0);
  const savedTextY = useSharedValue(0);

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

  // Gestes image
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { savedScale.value = scale.value; })
    .onUpdate((e) => { scale.value = Math.max(1, savedScale.value * e.scale); })
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

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => runOnJS(setIsEditingText)(true));

  // Exclusive : doubleTap prioritaire — singleTap attend que doubleTap échoue
  const composed = Gesture.Race(
    Gesture.Exclusive(doubleTap, singleTap),
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  // Geste texte (indépendant, dans son propre GestureDetector)
  const textPanGesture = Gesture.Pan()
    .onBegin(() => {
      savedTextX.value = textX.value;
      savedTextY.value = textY.value;
    })
    .onUpdate((e) => {
      textX.value = savedTextX.value + e.translationX;
      textY.value = savedTextY.value + e.translationY;
    })
    .onEnd(() => {
      savedTextX.value = textX.value;
      savedTextY.value = textY.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: textX.value },
      { translateY: textY.value },
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
      textX.value = 0;
      textY.value = 0;
      savedTextX.value = 0;
      savedTextY.value = 0;
      setOverlayText('');
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
        // Laisser Reanimated commiter les transforms sur le thread natif
        await new Promise((r) => setTimeout(r, 100));
        finalUri = await captureRef(containerRef, { format: 'jpg', quality: 0.9 });
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
        <Text className="text-white text-lg font-semibold flex-1">Nouvelle story</Text>
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
        <View style={{ flex: 1 }}>
          {/* Zone de capture — contient uniquement l'image et le texte */}
          <View
            ref={containerRef}
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

                {/* Texte : à l'intérieur de la vue animée → suit zoom et translation */}
                {overlayText !== '' && (
                  <View
                    style={StyleSheet.absoluteFill}
                    pointerEvents="box-none"
                  >
                    <View style={styles.textCenterContainer} pointerEvents="box-none">
                      <GestureDetector gesture={textPanGesture}>
                        <Reanimated.View style={textAnimatedStyle}>
                          <TouchableOpacity
                            onPress={() => setIsEditingText(true)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.textBubble}>
                              <Text style={styles.overlayText}>{overlayText}</Text>
                            </View>
                          </TouchableOpacity>
                        </Reanimated.View>
                      </GestureDetector>
                    </View>
                  </View>
                )}
              </Reanimated.View>
            </GestureDetector>
          </View>

          {/* Contrôles hors zone de capture */}
          <View
            style={styles.controls}
            pointerEvents="box-none"
          >
            <Text className="text-white/40 text-xs">
              {overlayText
                ? 'Glisse le texte · Tape pour modifier'
                : 'Tape pour ajouter du texte · Pince pour zoomer'}
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

      {/* Modal de saisie texte — en dehors de la zone de capture */}
      {isEditingText && (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFill, styles.editModal]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsEditingText(false)}
          />
          <View style={styles.editBox}>
            <TextInput
              style={styles.textInputField}
              placeholder="Ajouter du texte..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={overlayText}
              onChangeText={setOverlayText}
              multiline
              autoFocus
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => setIsEditingText(false)}
            />
            <TouchableOpacity
              className="bg-nexa rounded-full py-3 items-center"
              onPress={() => setIsEditingText(false)}
            >
              <Text className="text-white font-semibold">Valider</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  textCenterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBubble: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  overlayText: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
    textShadowOffset: { width: 1, height: 1 },
  },
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  editModal: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  editBox: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
    width: '100%',
  },
  textInputField: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
