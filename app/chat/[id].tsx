import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { apiRequest } from '../../lib/api';
import { connectSocket, getSocket } from '../../lib/socket';
import { uploadFile, firstUrl } from '../../lib/upload';
import { MessageMedia } from '../../components/MessageMedia';
import { MediaViewer } from '../../components/MediaViewer';
import GiphyPicker from '../../components/GiphyPicker';
import {
  getChatWallpaper,
  setChatWallpaper,
  getConversationCustomization,
  getConversationClearedAt,
  setConversationClearedAt,
  type ConversationCustomization,
} from '../../lib/storage';
import type { ChatWallpaper } from '../../lib/chatWallpapers';
import { resolveBubbleColor } from '../../lib/bubbleColors';
import { consumeScrollTarget } from '../../lib/chatNav';
import { ChatBackground } from '../../components/ChatBackground';
import ChatWallpaperPicker from '../../components/ChatWallpaperPicker';
import { UserAvatar } from '../../components/UserAvatar';

const NEXA = '#128C7E';
const MUTE_FOREVER = new Date('2999-12-31T00:00:00Z'); // sentinelle « toujours »

type ConvMember = { userId: string; role: string; user: { id: string; name: string; photoUrl: string | null } };
type ConvMeta = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  members: ConvMember[];
  ephemeralDuration: number | null;
  myMutedUntil: string | null;
};
type Flags = { pinned: string[]; starred: string[] };
type HeaderProfile = {
  photoUrl: string | null;
  canCall: boolean;
  lastSeenAt: string | null;
  online: boolean;
};

// Légère ombre portée sur les bulles → lisibles sur n'importe quel fond.
const BUBBLE_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 1.5,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

// Médias affichés en grand (sans bulle) vs en carte (audio/document).
const isImageLike = (mt?: string | null) => mt === 'image' || mt === 'video' || mt === 'gif';
const recFmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

type Sender = { id: string; name: string };
type Message = {
  id: string;
  content: string;
  createdAt: string;
  sender: Sender;
  conversationId?: string;
  type?: string;
  storyId?: string | null;
  storyMediaUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  durationMs?: number | null;
};
type MediaPayload = {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'gif';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationMs?: number;
};

// Détecte une réaction emoji seule (≤ 8 pictogrammes) → affichage géant hors bulle
const isEmojiOnly = (raw?: string | null): boolean => {
  const t = (raw ?? '').trim();
  if (!t) return false;
  // retire espaces, ZWJ (‍) et variation selector (️)
  const stripped = t.replace(/[\s‍️]/gu, '');
  if (!stripped || [...stripped].length > 8) return false;
  return /^\p{Extended_Pictographic}+$/u.test(stripped);
};

export default function ChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [convType, setConvType] = useState<'direct' | 'group'>('direct');
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [header, setHeader] = useState<HeaderProfile | null>(null);
  const [custom, setCustom] = useState<ConversationCustomization>({});
  const [clearedAt, setClearedAt] = useState<number | null>(null);
  const [wallpaper, setWallpaper] = useState<ChatWallpaper | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Présence + frappe (Phase B)
  const [online, setOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  // Mute / éphémère / épinglés / favoris (Phase C)
  const [ephemeralDuration, setEphemeralDuration] = useState<number | null>(null);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flags>({ pinned: [], starred: [] });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const typingSentRef = useRef(false); // a-t-on déjà signalé qu'on écrit ?
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null); // arrêt auto de notre frappe
  const peerTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null); // masquage auto (5 s)
  const otherUserIdRef = useRef<string | null>(null); // pour filtrer les events présence
  // Pièces jointes / médias (Phase D)
  const [viewer, setViewer] = useState<{ type: 'image' | 'video'; url: string } | null>(null);
  const [giphyOpen, setGiphyOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plusRotation = useSharedValue(0);
  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotation.value}deg` }],
  }));

  const loadFlags = useCallback(() => {
    apiRequest<Flags>(`/conversations/${id}/flags`).then(setFlags).catch(() => {});
  }, [id]);

  // Rechargé à chaque focus : perso locales + épinglés/favoris + cible de défilement
  // (l'utilisateur revient du panneau de détails).
  useFocusEffect(
    useCallback(() => {
      getChatWallpaper(id).then(setWallpaper);
      getConversationCustomization(id).then(setCustom);
      getConversationClearedAt(id).then(setClearedAt);
      loadFlags();
      const target = consumeScrollTarget(id);
      if (target) setScrollTarget(target);
    }, [id, loadFlags]),
  );

  // Aperçu live : on applique + persiste immédiatement sans fermer la feuille.
  const handleSelectWallpaper = (w: ChatWallpaper | null) => {
    setWallpaper(w);
    setChatWallpaper(id, w);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const me = await apiRequest<{ id: string }>('/users/me');
        setCurrentUserId(me.id);

        // Métadonnées de la conversation → identifier l'autre participant (conv directe).
        const meta = await apiRequest<ConvMeta>(`/conversations/${id}`);
        setConvType(meta.type);
        setEphemeralDuration(meta.ephemeralDuration);
        setMutedUntil(meta.myMutedUntil);
        if (meta.type === 'direct') {
          const other = meta.members.find((m) => m.userId !== me.id);
          if (other) {
            setOtherUserId(other.userId);
            otherUserIdRef.current = other.userId;
            // En-tête gated (re-vérifié serveur) : photo, appel, dernière connexion, en ligne.
            apiRequest<HeaderProfile>(`/users/${other.userId}/profile`)
              .then((p) => {
                setHeader({
                  photoUrl: p.photoUrl,
                  canCall: p.canCall,
                  lastSeenAt: p.lastSeenAt,
                  online: p.online,
                });
                setOnline(p.online);
                setLastSeen(p.lastSeenAt);
              })
              .catch(() => {});
          }
        }

        const history = await apiRequest<Message[]>(`/conversations/${id}/messages`);
        setMessages(history.reverse());

        const socket = await connectSocket();
        socket.emit('join_conversation', id);

        socket.on('new_message', (msg: Message) => {
          if (msg.conversationId === id || !msg.conversationId) {
            setMessages((prev) => [...prev, msg]);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
          }
        });

        socket.on('removed_from_group', ({ conversationId }: { conversationId: string }) => {
          if (conversationId === id) router.replace('/(tabs)');
        });

        // Frappe du correspondant → affichage + masquage auto après 5 s d'inactivité.
        socket.on(
          'peer_typing',
          (d: { conversationId: string; userId: string; typing: boolean }) => {
            if (d.conversationId !== id) return;
            if (peerTypingRef.current) clearTimeout(peerTypingRef.current);
            if (d.typing) {
              setPeerTyping(true);
              peerTypingRef.current = setTimeout(() => setPeerTyping(false), 5000);
            } else {
              setPeerTyping(false);
            }
          },
        );

        // Présence du correspondant (gating déjà appliqué côté serveur).
        socket.on(
          'presence_update',
          (d: { userId: string; online: boolean; lastSeenAt: string | null }) => {
            if (d.userId !== otherUserIdRef.current) return;
            setOnline(d.online);
            if (d.lastSeenAt) setLastSeen(d.lastSeenAt);
          },
        );
      } catch {
        router.replace('/(tabs)');
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      const socket = getSocket();
      socket?.off('new_message');
      socket?.off('removed_from_group');
      socket?.off('peer_typing');
      socket?.off('presence_update');
      // On arrête proprement notre propre indicateur de frappe.
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      if (peerTypingRef.current) clearTimeout(peerTypingRef.current);
      if (typingSentRef.current) {
        socket?.emit('typing', { conversationId: id, typing: false });
        typingSentRef.current = false;
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [id]);

  const stopTyping = (socket: ReturnType<typeof getSocket>) => {
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    if (typingSentRef.current) {
      socket?.emit('typing', { conversationId: id, typing: false });
      typingSentRef.current = false;
    }
  };

  // Émission de l'indicateur de frappe (auto-stop après 3 s sans saisie).
  const handleChangeText = (v: string) => {
    setText(v);
    const socket = getSocket();
    if (!socket) return;
    if (!typingSentRef.current) {
      socket.emit('typing', { conversationId: id, typing: true });
      typingSentRef.current = true;
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => {
      socket.emit('typing', { conversationId: id, typing: false });
      typingSentRef.current = false;
    }, 3000);
  };

  const sendMessage = () => {
    const content = text.trim();
    if (!content) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit('send_message', { conversationId: id, content });
    setText('');
    stopTyping(socket);
  };

  // --- Médias / pièces jointes ---
  const sendMedia = (payload: MediaPayload, caption = '') => {
    getSocket()?.emit('send_message', { conversationId: id, content: caption, ...payload });
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    const contentType = isVideo
      ? asset.mimeType?.startsWith('video/')
        ? asset.mimeType
        : 'video/mp4'
      : 'image/jpeg';
    setUploading(true);
    try {
      const url = await uploadFile(asset.uri, contentType, 'chat');
      sendMedia({
        mediaUrl: url,
        mediaType: isVideo ? 'video' : 'image',
        mimeType: contentType,
        durationMs: asset.duration ? Math.round(asset.duration) : undefined,
      });
    } catch {
      Alert.alert(t('error'), t('media.upload_error'));
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'application/pdf';
    setUploading(true);
    try {
      const url = await uploadFile(asset.uri, contentType, 'chat');
      sendMedia({
        mediaUrl: url,
        mediaType: 'document',
        fileName: asset.name,
        fileSize: asset.size ?? undefined,
        mimeType: contentType,
      });
    } catch {
      Alert.alert(t('error'), t('media.upload_error'));
    } finally {
      setUploading(false);
    }
  };

  const onGifSelect = (url: string) => {
    setGiphyOpen(false);
    sendMedia({ mediaUrl: url, mediaType: 'gif' });
  };

  const toggleAttach = () => {
    setAttachOpen((o) => {
      const next = !o;
      plusRotation.value = withTiming(next ? 45 : 0, { duration: 200 });
      return next;
    });
  };
  // Ferme le panneau (en remettant le « + » droit) puis lance l'action choisie.
  const runAttach = (fn: () => void) => {
    setAttachOpen(false);
    plusRotation.value = withTiming(0, { duration: 200 });
    fn();
  };
  const attachItems = [
    { key: 'gallery', icon: 'images' as const, color: '#8B5CF6', label: t('media.gallery'), action: pickFromGallery },
    { key: 'document', icon: 'document-text' as const, color: '#3B82F6', label: t('media.document'), action: pickDocument },
    { key: 'gif', icon: 'happy' as const, color: '#EC4899', label: t('media.gif'), action: () => setGiphyOpen(true) },
  ];

  // --- Message vocal ---
  const stopRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };
  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('media.mic_permission'));
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordSeconds(0);
    setIsRecording(true);
    recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
  };
  const cancelRecording = async () => {
    stopRecordTimer();
    setIsRecording(false);
    await recorder.stop().catch(() => {});
  };
  const stopAndSendRecording = async () => {
    stopRecordTimer();
    setIsRecording(false);
    const seconds = recordSeconds;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || seconds < 1) return;
      setUploading(true);
      const url = await uploadFile(uri, 'audio/m4a', 'chat');
      sendMedia({ mediaUrl: url, mediaType: 'audio', mimeType: 'audio/m4a', durationMs: seconds * 1000 });
    } catch {
      Alert.alert(t('error'), t('media.upload_error'));
    } finally {
      setUploading(false);
    }
  };

  // --- Couper les notifications ---
  const applyMute = (until: Date | null) => {
    setMutedUntil(until ? until.toISOString() : null);
    apiRequest(`/conversations/${id}/mute`, {
      method: 'PATCH',
      body: { mutedUntil: until ? until.toISOString() : null },
    }).catch(() => {});
  };
  const muteMenu = () => {
    const h = (hours: number) => new Date(Date.now() + hours * 3600 * 1000);
    Alert.alert(t('details.mute'), undefined, [
      { text: t('mute.8h'), onPress: () => applyMute(h(8)) },
      { text: t('mute.week'), onPress: () => applyMute(h(24 * 7)) },
      { text: t('mute.always'), onPress: () => applyMute(MUTE_FOREVER) },
      ...(mutedUntil ? [{ text: t('mute.unmute'), onPress: () => applyMute(null) }] : []),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  // --- Messages éphémères ---
  const applyEphemeral = (duration: number | null) => {
    setEphemeralDuration(duration);
    apiRequest(`/conversations/${id}/ephemeral`, { method: 'PATCH', body: { duration } }).catch(
      () => {},
    );
  };
  const ephemeralMenu = () => {
    const DAY = 24 * 3600;
    Alert.alert(t('details.ephemeral'), undefined, [
      { text: t('ephemeral.24h'), onPress: () => applyEphemeral(DAY) },
      { text: t('ephemeral.7d'), onPress: () => applyEphemeral(7 * DAY) },
      { text: t('ephemeral.30d'), onPress: () => applyEphemeral(30 * DAY) },
      { text: t('ephemeral.off'), onPress: () => applyEphemeral(null) },
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  // --- Épingler / Favori (appui long sur un message) ---
  const togglePin = (messageId: string, pinned: boolean) =>
    apiRequest(`/conversations/${id}/messages/${messageId}/pin`, {
      method: pinned ? 'DELETE' : 'POST',
    })
      .then(loadFlags)
      .catch((e: any) => Alert.alert(t('error'), e.message));
  const toggleStar = (messageId: string, starred: boolean) =>
    apiRequest(`/conversations/${id}/messages/${messageId}/star`, {
      method: starred ? 'DELETE' : 'POST',
    })
      .then(loadFlags)
      .catch((e: any) => Alert.alert(t('error'), e.message));
  const openMessageMenu = (messageId: string) => {
    const pinned = flags.pinned.includes(messageId);
    const starred = flags.starred.includes(messageId);
    Alert.alert('', undefined, [
      {
        text: pinned ? t('details.unpin') : t('details.pin'),
        onPress: () => togglePin(messageId, pinned),
      },
      {
        text: starred ? t('details.unstar') : t('details.star'),
        onPress: () => toggleStar(messageId, starred),
      },
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  // --- Valeurs dérivées ---
  const displayName = custom.nickname || name || '';
  const bubbleColor = resolveBubbleColor(custom.bubbleColor);
  // « Effacer » local : on masque les messages antérieurs à l'horodatage stocké.
  const visibleMessages = clearedAt
    ? messages.filter((m) => new Date(m.createdAt).getTime() > clearedAt)
    : messages;
  // Sous-titre (priorité : frappe > en ligne > vu le… > rien).
  const subtitle = peerTyping
    ? t('chat.typing')
    : online
      ? t('chat.online')
      : lastSeen
        ? t('chat.seen_at', { value: formatSeen(lastSeen) })
        : '';
  const subtitleAccent = peerTyping || online; // vert pour frappe / en ligne
  const isMuted = !!mutedUntil && new Date(mutedUntil) > new Date();

  // Défilement + surlignage temporaire vers un message (épinglé/favori) demandé par le panneau.
  useEffect(() => {
    if (!scrollTarget) return;
    const idx = visibleMessages.findIndex((m) => m.id === scrollTarget);
    if (idx < 0) return; // message non chargé (trop ancien) → on ignore
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightId(scrollTarget);
    setScrollTarget(null);
    const to = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(to);
  }, [scrollTarget, visibleMessages]);

  const openDetails = () => {
    if (convType !== 'direct' || !otherUserId) return;
    router.push({
      pathname: '/chat/details' as any,
      params: { conversationId: id, userId: otherUserId, name: displayName },
    });
  };

  const clearChat = () => {
    Alert.alert(t('details.clear_chat'), t('details.clear_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('details.clear_chat'),
        style: 'destructive',
        onPress: async () => {
          const ts = Date.now();
          await setConversationClearedAt(id, ts);
          setClearedAt(ts);
        },
      },
    ]);
  };

  const confirmBlock = () => {
    if (!otherUserId) return;
    Alert.alert(t('moderation.block_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () =>
          apiRequest('/blocks', { method: 'POST', body: { userId: otherUserId } })
            .then(() => router.replace('/(tabs)'))
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);
  };

  const openReport = () => {
    if (!otherUserId) return;
    const cats = ['spam', 'impersonation', 'inappropriate', 'other'];
    Alert.alert(t('moderation.report_category'), '', [
      ...cats.map((c) => ({
        text: t(`moderation.${c}`),
        onPress: () =>
          apiRequest('/reports', { method: 'POST', body: { userId: otherUserId, category: c } })
            .then(() => Alert.alert(t('moderation.report_done')))
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  const comingSoon = () => Alert.alert('', t('details.coming_soon'));

  const openMenu = () => {
    const direct = convType === 'direct' && !!otherUserId;
    Alert.alert(displayName, undefined, [
      { text: t('details.search'), onPress: comingSoon },
      { text: t('details.mute'), onPress: muteMenu },
      { text: t('details.ephemeral'), onPress: ephemeralMenu },
      { text: t('chat.wallpaper'), onPress: () => setPickerOpen(true) },
      { text: t('details.clear_chat'), style: 'destructive', onPress: clearChat },
      ...(direct
        ? [
            { text: t('moderation.block'), style: 'destructive' as const, onPress: confirmBlock },
            { text: t('moderation.report'), onPress: openReport },
          ]
        : []),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#128C7E" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="px-1 py-1">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>

        {/* Avatar + point de statut */}
        <TouchableOpacity onPress={openDetails} disabled={convType !== 'direct'} className="ml-1">
          {convType === 'group' ? (
            <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center">
              <Ionicons name="people" size={20} color={NEXA} />
            </View>
          ) : (
            <View>
              <UserAvatar photoUrl={header?.photoUrl ?? null} name={displayName} size={40} />
              {/* vert = en ligne / gris = hors ligne */}
              <View
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-gray-400'}`}
              />
            </View>
          )}
        </TouchableOpacity>

        {/* Nom (tronqué) + sous-titre dynamique */}
        <TouchableOpacity
          className="flex-1 ml-3"
          onPress={openDetails}
          disabled={convType !== 'direct'}
        >
          <View className="flex-row items-center">
            <Text
              className="text-base font-semibold text-gray-900 flex-shrink"
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {ephemeralDuration ? (
              <Ionicons name="timer-outline" size={14} color="#6B7280" style={{ marginLeft: 6 }} />
            ) : null}
            {isMuted ? (
              <Ionicons
                name="notifications-off-outline"
                size={14}
                color="#6B7280"
                style={{ marginLeft: 4 }}
              />
            ) : null}
          </View>
          {subtitle ? (
            <Text
              className={`text-xs ${subtitleAccent ? 'text-nexa' : 'text-gray-400'}`}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* Boutons d'appel (grisés selon canCall serveur) — appels = Mois 4 */}
        {convType === 'direct' ? (
          <>
            <TouchableOpacity
              className="px-2 py-1"
              style={{ opacity: header?.canCall ? 1 : 0.4 }}
              onPress={() =>
                Alert.alert(
                  '',
                  header?.canCall ? t('details.calls_coming') : t('details.call_unavailable'),
                )
              }
            >
              <Ionicons name="call" size={21} color={NEXA} />
            </TouchableOpacity>
            <TouchableOpacity
              className="px-2 py-1"
              style={{ opacity: header?.canCall ? 1 : 0.4 }}
              onPress={() =>
                Alert.alert(
                  '',
                  header?.canCall ? t('details.calls_coming') : t('details.call_unavailable'),
                )
              }
            >
              <Ionicons name="videocam" size={21} color={NEXA} />
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity className="px-2 py-1" onPress={openMenu}>
          <Ionicons name="ellipsis-vertical" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ChatBackground wallpaper={wallpaper}>
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender?.id === currentUserId;
            const isStoryReply = item.type === 'story_reply' || !!item.storyMediaUrl;
            const reaction = isStoryReply && isEmojiOnly(item.content);
            const isPinned = flags.pinned.includes(item.id);
            const isStarred = flags.starred.includes(item.id);
            const highlighted = highlightId === item.id;

            return (
              <Pressable
                onLongPress={() => openMessageMenu(item.id)}
                delayLongPress={300}
                className={`max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                style={
                  highlighted
                    ? { backgroundColor: 'rgba(250,204,21,0.25)', borderRadius: 14, padding: 2 }
                    : undefined
                }
              >
                {(isPinned || isStarred) && (
                  <View
                    className={`flex-row items-center gap-1 mb-0.5 px-1 ${isMe ? 'flex-row-reverse' : ''}`}
                  >
                    {isPinned && <Ionicons name="pin" size={11} color="#9CA3AF" />}
                    {isStarred && <Ionicons name="star" size={11} color="#F59E0B" />}
                  </View>
                )}
                {isStoryReply ? (
                  <>
                    {/* Libellé contextuel : répondu / réagi */}
                    <View
                      className={`flex-row items-center gap-1 mb-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}
                    >
                      <Ionicons name="arrow-undo" size={12} color="#9CA3AF" />
                      <Text className="text-[11px] text-gray-400">
                        {reaction
                          ? isMe
                            ? t('chat.you_reacted')
                            : t('chat.reacted', { name: item.sender?.name })
                          : isMe
                            ? t('chat.you_replied')
                            : t('chat.replied', { name: item.sender?.name })}
                      </Text>
                    </View>

                    {/* Vignette verticale de la story */}
                    {item.storyMediaUrl && (
                      <Image
                        source={{ uri: item.storyMediaUrl }}
                        className="rounded-xl border border-gray-200 bg-gray-100 mb-1"
                        style={{ width: 50, height: 84 }}
                      />
                    )}

                    {/* Réaction emoji en grand, ou bulle de texte */}
                    {reaction ? (
                      <Text style={{ fontSize: 50, lineHeight: 58 }} className="px-1">
                        {item.content}
                      </Text>
                    ) : (
                      <View
                        style={[BUBBLE_SHADOW, isMe ? { backgroundColor: bubbleColor } : null]}
                        className={`rounded-2xl px-4 py-2 ${isMe ? '' : 'bg-white'}`}
                      >
                        <Text className={isMe ? 'text-white' : 'text-gray-900'}>
                          {item.content}
                        </Text>
                      </View>
                    )}
                  </>
                ) : item.mediaUrl ? (
                  <>
                    {!isMe && (
                      <Text className="text-xs text-gray-400 mb-1 ml-1">{item.sender?.name}</Text>
                    )}
                    {isImageLike(item.mediaType) ? (
                      <View>
                        <MessageMedia
                          message={item}
                          tint={bubbleColor}
                          onOpenImage={(url) => setViewer({ type: 'image', url })}
                          onOpenVideo={(url) => setViewer({ type: 'video', url })}
                        />
                        {item.content ? (
                          <Text className="text-xs text-gray-500 mt-1 px-1">{item.content}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={BUBBLE_SHADOW} className="rounded-2xl px-3 py-2 bg-white">
                        <MessageMedia
                          message={item}
                          tint={bubbleColor}
                          onOpenImage={() => {}}
                          onOpenVideo={() => {}}
                        />
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {!isMe && (
                      <Text className="text-xs text-gray-400 mb-1 ml-1">{item.sender?.name}</Text>
                    )}
                    <Pressable
                      onPress={
                        firstUrl(item.content) ? () => Linking.openURL(firstUrl(item.content)!) : undefined
                      }
                      style={[BUBBLE_SHADOW, isMe ? { backgroundColor: bubbleColor } : null]}
                      className={`rounded-2xl px-4 py-2 ${isMe ? '' : 'bg-white'}`}
                    >
                      <Text
                        className={`${isMe ? 'text-white' : 'text-gray-900'} ${firstUrl(item.content) ? 'underline' : ''}`}
                      >
                        {item.content}
                      </Text>
                    </Pressable>
                  </>
                )}
              </Pressable>
            );
          }}
          onScrollToIndexFailed={() => {}}
        />
        </ChatBackground>

        {/* Panneau de pièces jointes animé */}
        {attachOpen && !isRecording && (
          <View className="flex-row px-5 py-4 border-t border-gray-100" style={{ gap: 28 }}>
            {attachItems.map((it, i) => (
              <Animated.View
                key={it.key}
                entering={FadeInDown.delay(i * 40).springify().damping(26).stiffness(200)}
                exiting={FadeOutDown.duration(120)}
              >
                <TouchableOpacity className="items-center" onPress={() => runAttach(it.action)}>
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center"
                    style={{ backgroundColor: it.color }}
                  >
                    <Ionicons name={it.icon} size={26} color="white" />
                  </View>
                  <Text className="text-xs text-gray-600 mt-1.5">{it.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}

        {uploading && (
          <Text className="text-xs text-gray-400 px-4 pt-1">{t('media.uploading')}</Text>
        )}

        {/* Barre d'enregistrement vocal */}
        {isRecording ? (
          <View className="flex-row items-center px-3 py-3 border-t border-gray-100">
            <TouchableOpacity onPress={cancelRecording} className="px-2">
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
            <View className="flex-1 flex-row items-center ml-2">
              <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
              <Text className="text-gray-700">{recFmt(recordSeconds)}</Text>
            </View>
            <TouchableOpacity
              onPress={stopAndSendRecording}
              className="w-10 h-10 bg-nexa rounded-full items-center justify-center"
            >
              <Ionicons name="send" size={18} color="white" />
            </TouchableOpacity>
          </View>
        ) : (
          /* Input */
          <View className="flex-row items-center px-3 py-2 border-t border-gray-100">
            <TouchableOpacity onPress={toggleAttach} disabled={uploading} className="mr-1 px-1">
              <Animated.View style={plusStyle}>
                <Ionicons name="add-circle-outline" size={26} color={NEXA} />
              </Animated.View>
            </TouchableOpacity>
            <TextInput
              className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2 text-base"
              placeholder={t('chat.message_placeholder')}
              value={text}
              onChangeText={handleChangeText}
              multiline
              returnKeyType="send"
              onSubmitEditing={sendMessage}
            />
            {text.trim() ? (
              <TouchableOpacity
                className="w-10 h-10 bg-nexa rounded-full items-center justify-center"
                onPress={sendMessage}
              >
                <Ionicons name="send" size={18} color="white" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="w-10 h-10 bg-nexa rounded-full items-center justify-center"
                onPress={startRecording}
              >
                <Ionicons name="mic" size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <ChatWallpaperPicker
        visible={pickerOpen}
        current={wallpaper}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectWallpaper}
      />

      {viewer && (
        <MediaViewer type={viewer.type} url={viewer.url} onClose={() => setViewer(null)} />
      )}
      <GiphyPicker visible={giphyOpen} onClose={() => setGiphyOpen(false)} onSelect={onGifSelect} />
    </SafeAreaView>
  );
}

// « Vu le JJ/MM à HH:MM » (utilisé par le sous-titre du header).
function formatSeen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}
