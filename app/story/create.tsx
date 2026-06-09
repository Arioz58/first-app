import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmojiPicker } from '../../components/EmojiPicker';
import { StoryBackground } from '../../components/StoryBackground';
import { StoryCamera } from '../../components/StoryCamera';
import { VideoTrimmer } from '../../components/VideoTrimmer';
import { apiRequest } from '../../lib/api';
import { STICKER_FONT_SIZE } from '../../lib/storyStickers';
import { DEFAULT_BACKGROUND_ID, STORY_BACKGROUNDS } from '../../lib/storyBackgrounds';
import {
  DEFAULT_BG_MODE,
  DEFAULT_BOLD,
  DEFAULT_ITALIC,
  DEFAULT_TEXT_COLOR,
  DEFAULT_UNDERLINE,
  getTextFontStyle,
  getTextRenderStyle,
  STORY_COLORS,
  TEXT_TYPOGRAPHY,
  type BgMode,
} from '../../lib/storyText';

// ─── Types ────────────────────────────────────────────────────────────────────

type PickedMedia = { uri: string; mimeType: string; width: number; height: number };
type TextItem   = {
  id: string; content: string;
  x: number; y: number; scale: number; rotation: number;
  color: string; bgMode: BgMode;
  bold: boolean; italic: boolean; underline: boolean;
  kind?: 'text' | 'sticker';
};

// ─── Composant TextOverlay ────────────────────────────────────────────────────
// Chaque texte a ses propres shared values et gesture grâce au composant dédié.

// Rayon (px écran) autour du centre de la poubelle qui déclenche la suppression
const TRASH_RADIUS = 90;

// Aimantation des guides d'alignement
const SNAP_PX = 12;             // distance d'accroche au centre (px écran)
const ROT_SNAP = 0.07;          // tolérance d'accroche en rotation (~4°)
const ROT_STEP = Math.PI / 4;   // pas d'aimantation de rotation (45°)
const GUIDE_COLOR = '#34C759';

type TextOverlayProps = {
  item: TextItem;
  imageScale: SharedValue<number>;
  imageTX: SharedValue<number>;
  imageTY: SharedValue<number>;
  // Centre de la poubelle en coordonnées écran (absolues)
  trashCenterX: number;
  trashCenterY: number;
  isDraggingAnyText: SharedValue<boolean>;
  isOverTrash: SharedValue<boolean>;
  // Guides d'alignement (centre X / centre Y)
  showVGuide: SharedValue<boolean>;
  showHGuide: SharedValue<boolean>;
  // Texte actif piloté par le pinch/rotation du conteneur (plein écran)
  activeTextId: SharedValue<string>;
  activeScale: SharedValue<number>;
  activeRotation: SharedValue<number>;
  // Gestes du conteneur avec lesquels le pan du texte doit cohabiter
  simultaneousGestures: any[];
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (x: number, y: number, scale: number, rotation: number) => void;
};

function TextOverlay({
  item,
  imageScale, imageTX, imageTY,
  trashCenterX, trashCenterY,
  isDraggingAnyText, isOverTrash,
  showVGuide, showHGuide,
  activeTextId, activeScale, activeRotation,
  simultaneousGestures,
  onEdit, onDelete, onUpdate,
}: TextOverlayProps) {
  const localX = useSharedValue(item.x);
  const savedX = useSharedValue(item.x);
  const localY = useSharedValue(item.y);
  const savedY = useSharedValue(item.y);
  const localScale = useSharedValue(item.scale);
  const localRotation = useSharedValue(item.rotation);
  // Ce texte est-il celui qui « possède » le geste en cours ? Évite qu'un 2e
  // doigt posé sur un autre texte ne vole la cible du texte déjà actif.
  const owns = useSharedValue(false);

  // Légère animation d'apparition au montage (création du texte uniquement).
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 200 });
  }, [enter]);

  // Le pan (1 doigt, petit hitbox) sélectionne ET déplace le texte. Le pinch
  // et la rotation sont gérés par le conteneur plein écran et ciblent le texte
  // « actif » → le 2e doigt peut se poser n'importe où sur l'écran.
  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .simultaneousWithExternalGesture(...simultaneousGestures)
    .onBegin(() => {
      // Un texte est déjà actif (1er doigt) → ce toucher ne prend pas la main.
      if (activeTextId.value !== '') {
        owns.value = false;
        return;
      }
      owns.value = true;
      savedX.value = localX.value;
      savedY.value = localY.value;
      isDraggingAnyText.value = true;
      // Ce texte devient la cible du pinch/rotation du conteneur
      activeTextId.value = item.id;
      activeScale.value = localScale.value;
      activeRotation.value = localRotation.value;
    })
    .onUpdate((e) => {
      if (!owns.value) return;
      // Le texte vit dans l'espace (scalé) de l'image : on divise la translation
      // par le zoom pour qu'il suive le doigt au 1:1 à l'écran.
      let nx = savedX.value + e.translationX / imageScale.value;
      let ny = savedY.value + e.translationY / imageScale.value;

      // Aimantation au centre : offset écran du texte par rapport au centre.
      const offX = nx * imageScale.value + imageTX.value;
      const offY = ny * imageScale.value + imageTY.value;
      if (Math.abs(offX) < SNAP_PX) {
        nx = -imageTX.value / imageScale.value; // colle au centre horizontal
        showVGuide.value = true;
      } else {
        showVGuide.value = false;
      }
      if (Math.abs(offY) < SNAP_PX) {
        ny = -imageTY.value / imageScale.value; // colle au centre vertical
        showHGuide.value = true;
      } else {
        showHGuide.value = false;
      }
      localX.value = nx;
      localY.value = ny;

      // Suppression selon la position du DOIGT (et non du texte). Comme ce pan
      // ne suit que le 1er doigt, le 2e doigt n'a aucun effet sur la poubelle.
      const dx = e.absoluteX - trashCenterX;
      const dy = e.absoluteY - trashCenterY;
      isOverTrash.value = dx * dx + dy * dy < TRASH_RADIUS * TRASH_RADIUS;
    })
    // onFinalize (et non onEnd) car si le 1er doigt reste immobile pendant que
    // le 2e scale/rotate, le pan ne s'« active » jamais → onEnd ne se déclenche
    // pas et le texte resterait sélectionné. onFinalize est toujours appelé.
    .onFinalize(() => {
      if (!owns.value) return;
      owns.value = false;
      isDraggingAnyText.value = false;
      showVGuide.value = false;
      showHGuide.value = false;
      // Récupère l'échelle / rotation éventuellement modifiées par le conteneur
      localScale.value = activeScale.value;
      localRotation.value = activeRotation.value;
      activeTextId.value = '';
      if (isOverTrash.value) {
        isOverTrash.value = false;
        runOnJS(onDelete)();
      } else {
        isOverTrash.value = false;
        runOnJS(onUpdate)(localX.value, localY.value, localScale.value, localRotation.value);
      }
    });

  // La vue-geste ne porte QUE la translation → zone tactile de taille constante,
  // qui ne déborde pas sur les autres textes même quand celui-ci est agrandi.
  const translateStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateX: localX.value },
      { translateY: localY.value },
    ],
  }));

  // Le scale / rotation (visuel) est appliqué sur une vue interne. En RN les
  // transforms n'affectent pas le layout, donc le hitbox parent reste inchangé.
  const contentStyle = useAnimatedStyle(() => {
    const isActive = activeTextId.value === item.id;
    const base = isActive ? activeScale.value : localScale.value;
    // Très léger « pop » d'apparition : 0.85 → 1
    const pop = 0.85 + 0.15 * enter.value;
    return {
      transform: [
        { scale: base * pop },
        { rotate: `${isActive ? activeRotation.value : localRotation.value}rad` },
      ],
    };
  });

  const dyn = getTextRenderStyle(item.color, item.bgMode);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={overlay.center} pointerEvents="box-none">
        <GestureDetector gesture={panGesture}>
          <Reanimated.View style={[overlay.hitArea, translateStyle]}>
            <Reanimated.View style={contentStyle}>
              {item.kind === 'sticker' ? (
                <Text style={{ fontSize: STICKER_FONT_SIZE }}>{item.content}</Text>
              ) : (
                <TouchableOpacity onPress={onEdit} activeOpacity={0.85}>
                  <View style={dyn.bubble}>
                    <Text style={[TEXT_TYPOGRAPHY, getTextFontStyle(item.bold, item.italic, item.underline), dyn.text]}>
                      {item.content}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </Reanimated.View>
          </Reanimated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const overlay = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hitArea: { padding: 16, alignItems: 'center', justifyContent: 'center' },
});

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function CreateStoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = Dimensions.get('window');
  // Centre visuel de la poubelle (styles.trashWrapper : bottom 100 + rayon ~31),
  // exprimé en coordonnées écran absolues pour la détection au doigt.
  const trashCenterX = winW / 2;
  const trashCenterY = winH - insets.bottom - 131;

  const [media, setMedia] = useState<PickedMedia | null>(null);
  // Mode « story texte seul » : id du preset de fond (null = mode média)
  const [bgId, setBgId] = useState<string | null>(null);
  // Mode caméra in-app (avant l'éditeur)
  const [cameraMode, setCameraMode] = useState(false);
  // Vidéo brute en attente de rognage (ouvre le VideoTrimmer)
  const [trimUri, setTrimUri] = useState<string | null>(null);
  // Sélecteur d'emojis (stickers)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Textes multiples
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Style du texte en cours d'édition
  const [editColor, setEditColor] = useState(DEFAULT_TEXT_COLOR);
  const [editBgMode, setEditBgMode] = useState<BgMode>(DEFAULT_BG_MODE);
  const [editBold, setEditBold] = useState(DEFAULT_BOLD);
  const [editItalic, setEditItalic] = useState(DEFAULT_ITALIC);
  const [editUnderline, setEditUnderline] = useState(DEFAULT_UNDERLINE);
  // Empêche l'ouverture simultanée quand on tape un texte existant (inner + outer tap)
  const isOpeningEditor = useRef(false);

  // Transforms image
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerW = useSharedValue(0);
  const containerH = useSharedValue(0);

  // Neutralise le zoom/pan image quand il n'y a pas d'image à recadrer :
  // mode texte seul (fond coloré) OU vidéo (pas de crop spatial).
  const isTextOnly = useSharedValue(false);
  useEffect(() => {
    const isVid = !!media && media.mimeType.startsWith('video/');
    isTextOnly.value = (!!bgId && !media) || isVid;
  }, [bgId, media, isTextOnly]);

  // Player de preview vidéo dans l'éditeur (lecture en boucle)
  const editorPlayer = useVideoPlayer(null, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (media && media.mimeType.startsWith('video/')) {
      // replaceAsync : charge la vidéo hors du thread principal (pas de micro-gel)
      editorPlayer
        .replaceAsync({ uri: media.uri })
        .then(() => editorPlayer.play())
        .catch(() => {});
    } else {
      editorPlayer.pause();
    }
  }, [media, editorPlayer]);

  // Poubelle partagée entre tous les textes
  const isDraggingAnyText = useSharedValue(false);
  const isOverTrash = useSharedValue(false);

  // Texte actif manipulé par le pinch/rotation du conteneur plein écran.
  // '' = aucun → le pinch zoome l'image à la place.
  const activeTextId = useSharedValue('');
  const activeScale = useSharedValue(1);
  const activeSavedScale = useSharedValue(1);
  const activeRotation = useSharedValue(0);
  const activeSavedRotation = useSharedValue(0);

  // Guides d'alignement (centre X / Y) + repère de rotation
  const showVGuide = useSharedValue(false);
  const showHGuide = useSharedValue(false);
  const showRotGuide = useSharedValue(false);
  const rotGuideAngle = useSharedValue(0);

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

  // Pinch du conteneur : cible le texte actif s'il y en a un, sinon zoome l'image.
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      if (activeTextId.value !== '') activeSavedScale.value = activeScale.value;
      else if (!isTextOnly.value) savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      if (activeTextId.value !== '') {
        activeScale.value = Math.max(0.3, activeSavedScale.value * e.scale);
      } else if (!isTextOnly.value) {
        scale.value = Math.max(1, savedScale.value * e.scale);
      }
    })
    .onEnd(() => {
      if (activeTextId.value !== '') {
        activeSavedScale.value = activeScale.value;
      } else if (!isTextOnly.value) {
        savedScale.value = scale.value;
        clampTranslation(scale.value);
      }
    });

  // Rotation du conteneur : uniquement pour le texte actif (pas de rotation image).
  const rotationGesture = Gesture.Rotation()
    .onBegin(() => {
      if (activeTextId.value !== '') activeSavedRotation.value = activeRotation.value;
    })
    .onUpdate((e) => {
      if (activeTextId.value === '') return;
      let r = activeSavedRotation.value + e.rotation;
      // Aimantation aux multiples de 45°
      const nearest = Math.round(r / ROT_STEP) * ROT_STEP;
      if (Math.abs(r - nearest) < ROT_SNAP) {
        r = nearest;
        rotGuideAngle.value = nearest;
        showRotGuide.value = true;
      } else {
        showRotGuide.value = false;
      }
      activeRotation.value = r;
    })
    .onEnd(() => {
      if (activeTextId.value !== '') activeSavedRotation.value = activeRotation.value;
      showRotGuide.value = false;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onBegin(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      // Si un texte est en cours de manipulation (ou mode texte seul), pas de pan image
      if (activeTextId.value !== '' || isTextOnly.value) return;
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

  const openNewTextEditor = () => {
    if (isOpeningEditor.current) return;
    isOpeningEditor.current = true;
    setEditingId(null);
    setEditText('');
    setEditColor(DEFAULT_TEXT_COLOR);
    setEditBgMode(DEFAULT_BG_MODE);
    setEditBold(DEFAULT_BOLD);
    setEditItalic(DEFAULT_ITALIC);
    setEditUnderline(DEFAULT_UNDERLINE);
    setIsEditingText(true);
  };

  // Cycle le mode de fond : aucun → translucide → plein → aucun…
  const cycleBgMode = () => {
    setEditBgMode((m) => (m === 'none' ? 'translucent' : m === 'translucent' ? 'solid' : 'none'));
  };

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => runOnJS(openNewTextEditor)());

  const composed = Gesture.Race(
    Gesture.Exclusive(doubleTap, singleTap),
    Gesture.Simultaneous(pinchGesture, rotationGesture, panGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const trashWrapperStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isDraggingAnyText.value ? 1 : 0, { duration: 180 }),
    transform: [{ scale: withSpring(isDraggingAnyText.value ? 1 : 0.4) }],
  }));

  const trashCircleStyle = useAnimatedStyle(() => ({
    backgroundColor: isOverTrash.value ? 'rgba(220,38,38,0.9)' : 'rgba(0,0,0,0.55)',
    transform: [{ scale: withSpring(isOverTrash.value ? 1.3 : 1) }],
  }));

  const vGuideStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showVGuide.value ? 1 : 0, { duration: 120 }),
  }));
  const hGuideStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showHGuide.value ? 1 : 0, { duration: 120 }),
  }));
  const rotGuideStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showRotGuide.value ? 1 : 0, { duration: 120 }),
    transform: [{ rotate: `${rotGuideAngle.value}rad` }],
  }));

  const onContainerLayout = (e: LayoutChangeEvent) => {
    containerW.value = e.nativeEvent.layout.width;
    containerH.value = e.nativeEvent.layout.height;
  };

  // L'ouverture de l'éditeur intercepte le toucher → le onFinalize du pan du
  // texte peut ne pas se déclencher. On garantit un état propre à la fermeture.
  const resetActiveText = () => {
    activeTextId.value = '';
    isDraggingAnyText.value = false;
    isOverTrash.value = false;
    showVGuide.value = false;
    showHGuide.value = false;
    showRotGuide.value = false;
  };

  const confirmTextEdit = () => {
    resetActiveText();
    isOpeningEditor.current = false;
    setIsEditingText(false);
    const content = editText.trim();
    if (!content) {
      if (editingId) setTexts(prev => prev.filter(t => t.id !== editingId));
      setEditingId(null);
      setEditText('');
      return;
    }
    if (editingId) {
      setTexts(prev => prev.map(t => t.id === editingId
        ? { ...t, content, color: editColor, bgMode: editBgMode, bold: editBold, italic: editItalic, underline: editUnderline }
        : t));
    } else {
      setTexts(prev => [...prev, {
        id: Date.now().toString(), content,
        x: 0, y: 0, scale: 1, rotation: 0,
        color: editColor, bgMode: editBgMode,
        bold: editBold, italic: editItalic, underline: editUnderline,
      }]);
    }
    setEditingId(null);
    setEditText('');
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
      // Vidéo → on passe par le trimmer avant l'éditeur
      if (asset.type === 'video' || (asset.mimeType ?? '').startsWith('video')) {
        setTrimUri(asset.uri);
        return;
      }
      resetTransform();
      setTexts([]);
      setBgId(null);
      setMedia({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });
    }
  };

  // Vidéo trimmée → bascule dans l'éditeur média
  const handleTrimmed = (trimmedUri: string) => {
    setTrimUri(null);
    resetTransform();
    setTexts([]);
    setBgId(null);
    setMedia({ uri: trimmedUri, mimeType: 'video/mp4', width: 0, height: 0 });
  };

  // Entre en mode « story texte seul » : fond coloré par défaut + éditeur de texte ouvert
  const enterTextMode = () => {
    resetTransform();
    setTexts([]);
    setMedia(null);
    setBgId(DEFAULT_BACKGROUND_ID);
    openNewTextEditor();
  };

  // Ajoute un emoji comme sticker déplaçable (réutilise le système TextOverlay)
  const addSticker = (emoji: string) => {
    setShowEmojiPicker(false);
    setTexts(prev => [...prev, {
      id: Date.now().toString(),
      content: emoji,
      x: 0, y: 0, scale: 1, rotation: 0,
      color: DEFAULT_TEXT_COLOR, bgMode: DEFAULT_BG_MODE,
      bold: false, italic: false, underline: false,
      kind: 'sticker',
    }]);
  };

  // Capture caméra → vidéo via le trimmer, photo directement dans l'éditeur
  const handleCameraCapture = (m: PickedMedia) => {
    setCameraMode(false);
    if (m.mimeType.startsWith('video/')) {
      setTrimUri(m.uri);
      return;
    }
    resetTransform();
    setTexts([]);
    setBgId(null);
    setMedia(m);
  };

  const handlePublish = async () => {
    if (!media && !bgId) return;
    setLoading(true);
    try {
      // Lire les valeurs Reanimated une seule fois
      const W = containerW.value;
      const H = containerH.value;

      // ── Story « fond coloré » (texte seul) : pas d'upload, transform identité ──
      if (!media) {
        const storyTexts = texts
          .filter((t) => t.content.trim())
          .map((t) => ({
            content: t.content,
            kind: t.kind ?? 'text',
            normX: (W / 2 + t.x) / W,
            normY: (H / 2 + t.y) / H,
            scale: t.scale,
            rotation: t.rotation,
            color: t.color,
            bgMode: t.bgMode,
            bold: t.bold,
            italic: t.italic,
            underline: t.underline,
          }));
        await apiRequest('/stories', {
          method: 'POST',
          body: { background: bgId, ...(storyTexts.length > 0 && { texts: storyTexts }) },
        });
        router.replace('/(tabs)');
        return;
      }

      const isVideo = media.mimeType.startsWith('video/');
      let finalUri = media.uri;

      const s = scale.value;
      const tx = translateX.value;
      const ty = translateY.value;

      if (!isVideo) {
        const imgW = media.width;
        const imgH = media.height;
        const fitScale = Math.min(W / imgW, H / imgH);
        const rW = imgW * fitScale;
        const rH = imgH * fitScale;

        const visLeft  = Math.max(-rW / 2, (-W / 2 - tx) / s);
        const visRight = Math.min(rW / 2, (W / 2 - tx) / s);
        const visTop   = Math.max(-rH / 2, (-H / 2 - ty) / s);
        const visBottom = Math.min(rH / 2, (H / 2 - ty) / s);

        const originX = Math.round(Math.max(0, (visLeft + rW / 2) / fitScale));
        const originY = Math.round(Math.max(0, (visTop + rH / 2) / fitScale));
        const cropW   = Math.round(Math.min(imgW - originX, (visRight - visLeft) / fitScale));
        const cropH   = Math.round(Math.min(imgH - originY, (visBottom - visTop) / fitScale));

        const result = await ImageManipulator.manipulateAsync(
          media.uri,
          [{ crop: { originX, originY, width: cropW, height: cropH } }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 },
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

      // Position normalisée de chaque texte dans l'espace écran [0..1]
      const storyTexts = texts
        .filter(t => t.content.trim())
        .map(t => ({
          content: t.content,
          kind: t.kind ?? 'text',
          normX: (W / 2 + t.x * s + tx) / W,
          normY: (H / 2 + t.y * s + ty) / H,
          scale: t.scale,
          rotation: t.rotation,
          color: t.color,
          bgMode: t.bgMode,
          bold: t.bold,
          italic: t.italic,
          underline: t.underline,
        }));

      await apiRequest('/stories', {
        method: 'POST',
        body: {
          mediaUrl: publicUrl,
          ...(storyTexts.length > 0 && { texts: storyTexts }),
        },
      });

      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const isVideo = media?.mimeType.startsWith('video/');

  // Rendu live du texte en cours d'édition
  const editStyle = getTextRenderStyle(editColor, editBgMode);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold flex-1">Nouvelle story</Text>
        {(media || bgId) && (
          <TouchableOpacity onPress={() => setShowEmojiPicker(true)} className="mr-4">
            <Ionicons name="happy-outline" size={26} color="white" />
          </TouchableOpacity>
        )}
        {(media || bgId) && (
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

      {media || bgId ? (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onContainerLayout}>
            <GestureDetector gesture={composed}>
              <Reanimated.View style={[{ flex: 1 }, animatedStyle]}>
                {media ? (
                  isVideo ? (
                    <VideoView
                      player={editorPlayer}
                      style={{ flex: 1 }}
                      contentFit="contain"
                      nativeControls={false}
                    />
                  ) : (
                    <Image source={{ uri: media.uri }} style={{ flex: 1 }} resizeMode="contain" />
                  )
                ) : (
                  <StoryBackground id={bgId} style={{ flex: 1 }} />
                )}
                {texts.map(item => (
                  <TextOverlay
                    key={item.id}
                    item={item}
                    imageScale={scale}
                    imageTX={translateX}
                    imageTY={translateY}
                    trashCenterX={trashCenterX}
                    trashCenterY={trashCenterY}
                    isDraggingAnyText={isDraggingAnyText}
                    isOverTrash={isOverTrash}
                    showVGuide={showVGuide}
                    showHGuide={showHGuide}
                    activeTextId={activeTextId}
                    activeScale={activeScale}
                    activeRotation={activeRotation}
                    simultaneousGestures={[pinchGesture, rotationGesture, panGesture]}
                    onEdit={() => {
                      isOpeningEditor.current = true;
                      setEditingId(item.id);
                      setEditText(item.content);
                      setEditColor(item.color);
                      setEditBgMode(item.bgMode);
                      setEditBold(item.bold);
                      setEditItalic(item.italic);
                      setEditUnderline(item.underline);
                      setIsEditingText(true);
                    }}
                    onDelete={() => setTexts(prev => prev.filter(t => t.id !== item.id))}
                    onUpdate={(x, y, sc, rot) =>
                      setTexts(prev => prev.map(t => t.id === item.id ? { ...t, x, y, scale: sc, rotation: rot } : t))
                    }
                  />
                ))}
              </Reanimated.View>
            </GestureDetector>

            {/* Guides d'alignement (espace écran, au-dessus de l'image) */}
            <Reanimated.View pointerEvents="none" style={[styles.guideV, vGuideStyle]} />
            <Reanimated.View pointerEvents="none" style={[styles.guideH, hGuideStyle]} />
            <Reanimated.View pointerEvents="none" style={[styles.guideRot, rotGuideStyle]} />
          </View>

          {texts.length > 0 && (
            <Reanimated.View style={[styles.trashWrapper, trashWrapperStyle]} pointerEvents="none">
              <Reanimated.View style={[styles.trashCircle, trashCircleStyle]}>
                <Ionicons name="trash" size={26} color="white" />
              </Reanimated.View>
              <Text style={styles.trashLabel}>Supprimer</Text>
            </Reanimated.View>
          )}

          <View style={styles.controls} pointerEvents="box-none">
            {/* Sélecteur de fond (mode texte seul uniquement) */}
            {!media && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ flexGrow: 0 }}
                contentContainerStyle={styles.bgRow}
              >
                {STORY_BACKGROUNDS.map((b) => (
                  <TouchableOpacity key={b.id} onPress={() => setBgId(b.id)} activeOpacity={0.8}>
                    <StoryBackground
                      id={b.id}
                      style={[styles.bgSwatch, bgId === b.id && styles.bgSwatchActive]}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <Text className="text-white/40 text-xs">
              {texts.length > 0
                ? 'Tape pour ajouter · Glisse un texte pour déplacer'
                : media
                  ? 'Tape pour ajouter du texte · Pince pour zoomer'
                  : 'Tape pour ajouter du texte'}
            </Text>
            <TouchableOpacity
              className="bg-white/20 border border-white/40 rounded-full px-8 py-3"
              onPress={pickMedia}
            >
              <Text className="text-white font-medium">
                {media ? 'Changer' : 'Photo / vidéo'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <View className="flex-row items-start justify-center gap-7">
            <TouchableOpacity className="items-center gap-2" onPress={() => setCameraMode(true)} activeOpacity={0.8}>
              <View className="w-20 h-20 rounded-full bg-white/10 items-center justify-center">
                <Ionicons name="camera" size={34} color="white" />
              </View>
              <Text className="text-white text-sm font-medium">Caméra</Text>
            </TouchableOpacity>

            <TouchableOpacity className="items-center gap-2" onPress={pickMedia} activeOpacity={0.8}>
              <View className="w-20 h-20 rounded-full bg-white/10 items-center justify-center">
                <Ionicons name="images" size={32} color="white" />
              </View>
              <Text className="text-white text-sm font-medium">Galerie</Text>
            </TouchableOpacity>

            <TouchableOpacity className="items-center gap-2" onPress={enterTextMode} activeOpacity={0.8}>
              <View className="w-20 h-20 rounded-full bg-white/10 items-center justify-center">
                <Text className="text-white" style={{ fontSize: 30, fontWeight: 'bold' }}>Aa</Text>
              </View>
              <Text className="text-white text-sm font-medium">Texte</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-white/50 text-sm mt-8">Visible pendant 24h</Text>
        </View>
      )}

      {cameraMode && (
        <View style={StyleSheet.absoluteFill}>
          <StoryCamera onClose={() => setCameraMode(false)} onCapture={handleCameraCapture} />
        </View>
      )}

      {trimUri && (
        <View style={StyleSheet.absoluteFill}>
          <VideoTrimmer
            uri={trimUri}
            onConfirm={handleTrimmed}
            onCancel={() => setTrimUri(null)}
          />
        </View>
      )}

      <EmojiPicker
        visible={showEmojiPicker}
        onPick={addSticker}
        onClose={() => setShowEmojiPicker(false)}
      />

      {isEditingText && (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFill, styles.editModal]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          {/* Toucher en dehors = valider la saisie courante */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={confirmTextEdit} />

          <View style={[styles.editColumn, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            {/* Barre haute : fond + mise en forme (gauche), OK (droite) */}
            <View style={styles.editTopBar}>
              <View style={styles.fmtGroup}>
                <TouchableOpacity onPress={cycleBgMode} style={styles.fmtBtn}>
                  <Text style={styles.fmtLetter}>A</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditBold((v) => !v)}
                  style={[styles.fmtBtn, editBold && styles.fmtBtnActive]}
                >
                  <Text style={[styles.fmtLetter, { fontWeight: 'bold' }, editBold && styles.fmtLetterActive]}>B</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditItalic((v) => !v)}
                  style={[styles.fmtBtn, editItalic && styles.fmtBtnActive]}
                >
                  <Text style={[styles.fmtLetter, { fontStyle: 'italic' }, editItalic && styles.fmtLetterActive]}>I</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditUnderline((v) => !v)}
                  style={[styles.fmtBtn, editUnderline && styles.fmtBtnActive]}
                >
                  <Text style={[styles.fmtLetter, { textDecorationLine: 'underline' }, editUnderline && styles.fmtLetterActive]}>U</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity className="bg-nexa px-5 py-2 rounded-full" onPress={confirmTextEdit}>
                <Text className="text-white font-semibold">OK</Text>
              </TouchableOpacity>
            </View>

            {/* Saisie centrée = rendu en direct du texte tel qu'il apparaîtra */}
            <View style={styles.editCenter}>
              <View style={editStyle.bubble}>
                <TextInput
                  style={[TEXT_TYPOGRAPHY, getTextFontStyle(editBold, editItalic, editUnderline), editStyle.text, styles.editInput]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  scrollEnabled={false}
                  autoFocus
                  selectionColor={editStyle.text.color}
                  cursorColor={editStyle.text.color}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={confirmTextEdit}
                />
              </View>
            </View>

            {/* Palette de couleurs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.colorScroll}
              contentContainerStyle={styles.colorRow}
            >
              {STORY_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setEditColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, editColor === c && styles.swatchActive]}
                />
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  trashWrapper: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
  },
  trashCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  guideV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: GUIDE_COLOR,
  },
  guideH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: GUIDE_COLOR,
  },
  guideRot: {
    position: 'absolute',
    // étendu au-delà des bords pour couvrir l'écran à n'importe quel angle
    left: -200,
    right: -200,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: GUIDE_COLOR,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  editColumn: {
    flex: 1,
  },
  editTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  editCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  editInput: {
    minWidth: 40,
    // Marge horizontale : laisse de la place au débordement des glyphes
    // italiques (sinon RN renvoie le texte à la ligne) et au curseur.
    paddingVertical: 0,
    paddingHorizontal: 6,
  },
  fmtGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fmtBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'white',
  },
  fmtBtnActive: {
    backgroundColor: 'white',
  },
  fmtLetter: {
    fontSize: 18,
    color: 'white',
  },
  fmtLetterActive: {
    color: 'black',
  },
  colorScroll: {
    flexGrow: 0,
  },
  colorRow: {
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  swatchActive: {
    borderColor: 'white',
    borderWidth: 3,
    transform: [{ scale: 1.18 }],
  },
  bgRow: {
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    alignItems: 'center',
  },
  bgSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  bgSwatchActive: {
    borderColor: 'white',
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
});
