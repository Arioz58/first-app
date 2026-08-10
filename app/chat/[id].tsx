import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Pressable,
  ActivityIndicator, Image, Alert, useColorScheme, StyleSheet,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { AudioModule } from 'expo-audio';
import { apiRequest } from '../../lib/api';
import { connectSocket, getSocket } from '../../lib/socket';
import { uploadFile, firstUrl } from '../../lib/upload';
import { MessageMedia } from '../../components/MessageMedia';
import { AttachmentSheet, type AttachAction } from '../../components/AttachmentSheet';
import { PendingMediaBar, type PendingMedia } from '../../components/PendingMediaBar';
import { VoiceRecorderBar } from '../../components/VoiceRecorderBar';
import { MediaViewer } from '../../components/MediaViewer';
import { MediaGrid } from '../../components/MediaGrid';
import { AlbumViewer, type AlbumItem } from '../../components/AlbumViewer';
import GiphyPicker from '../../components/GiphyPicker';
import {
  LocationBubble,
  LocationPicker,
  type PickedLocation,
} from '../../components/LocationPicker';
import { LocationViewer } from '../../components/LocationViewer';
import {
  LIVE_DURATIONS,
  remainingLabel,
  startLiveShare,
  stopLiveShare,
  useMyLiveShare,
} from '../../lib/liveLocation';
import {
  getChatWallpaper,
  setChatWallpaper,
  getConversationCustomization,
  getConversationClearedAt,
  setConversationClearedAt,
  type ConversationCustomization,
} from '../../lib/storage';
import type { ChatWallpaper } from '../../lib/chatWallpapers';
import { bubbleGradient, resolveBubbleColor } from '../../lib/bubbleColors';
import { consumeScrollTarget } from '../../lib/chatNav';
import { setActiveConversation } from '../../lib/unreadMessages';
// ⚠️ Ce KeyboardAvoidingView n'est PAS celui de React Native : il suit la position
// réelle du clavier, mesurée nativement à chaque image. Celui de RN applique son
// décalage d'un bloc, et le piloter depuis l'événement JS laisse un décalage dans le
// temps — le temps que le callback soit traité, le clavier a déjà commencé à bouger.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { ChatBackground } from '../../components/ChatBackground';
import { GlassSurface, FLOATING_SHADOW } from '../../components/GlassSurface';
import { RADIUS, ROUND } from '../../lib/radius';
import { ProgressiveBlur } from '../../components/ProgressiveBlur';
import ChatWallpaperPicker from '../../components/ChatWallpaperPicker';
import { UserAvatar } from '../../components/UserAvatar';

const NEXA = '#1E40AF';
const MUTE_FOREVER = new Date('2999-12-31T00:00:00Z'); // sentinelle « toujours »
// Plafond de médias par envoi : chaque pièce part en upload S3 depuis le mobile, une
// sélection massive tiendrait la barre d'envoi occupée trop longtemps.
const MAX_PENDING = 10;
// Durée laissée au défilement animé de la FlatList avant la passe de calage finale
// (le scroll animé natif tourne autour de 300 ms).
const SMOOTH_SCROLL_MS = 420;
// Après l'envoi, le fil reste collé au bas pendant cette durée, quoi que disent les mesures.
//
// ⚠️ Sans elle, un message LONG se retrouvait sous la zone de saisie : la FlatList le rend
// d'abord à une hauteur estimée, et sa mesure réelle n'arrive qu'après le calage final. Le
// contenu grandit alors d'un coup de plusieurs centaines de pixels, mais `atBottomRef` —
// calculé sur le dernier événement de défilement, donc périmé — est déjà retombé à faux :
// le repositionnement suivant était abandonné. Seul le geste de l'utilisateur referme cette
// fenêtre, jamais une mesure.
const FOLLOW_WINDOW_MS = 1500;
// Même mécanique à l'ouverture, en plus généreux : un envoi n'ajoute qu'une bulle, alors
// qu'ici tout un historique est monté par lots et mesuré au fil de l'eau — sans quoi le
// dernier message se retrouvait sous la zone de saisie dès qu'il était un peu long.
const OPEN_FOLLOW_WINDOW_MS = 2500;
// Attente maximale avant d'afficher un album reçu incomplet. Un média peut ne jamais
// arriver (téléversement en échec chez l'expéditeur) : sans ce plafond, les autres
// resteraient retenus pour toujours.
const ALBUM_WAIT_MS = 6000;
// Marge au-dessus du repère de reprise quand on ouvre dessus : la carte d'en-tête FLOTTE
// au-dessus du fil, aligner le repère sur le haut de la zone visible le glisserait dessous.
const OPEN_TARGET_MARGIN = 16;
// Attente entre deux tentatives de `scrollToIndex`. Calée au-dessus de la période de
// regroupement des rendus de VirtualizedList (50 ms), sans quoi on retombe sur le même
// nombre de cellules mesurées.
const SCROLL_RETRY_MS = 120;
// De quoi franchir plusieurs lots de cellules ; au-delà, la cible est hors d'atteinte.
const SCROLL_MAX_TRIES = 8;
// Taille de page du serveur (`GET /conversations/:id/messages`). Une page incomplète
// signale le début de la conversation.
const MESSAGES_PAGE = 30;
// De combien la liste déborde SOUS la zone de saisie : c'est ce débordement qui fait
// passer les messages derrière son verre quand on fait défiler, au lieu de les couper.
//
// ⚠️ Valeur FIXE et non hauteur mesurée : la barre change de taille à chaque frappe sur
// plusieurs lignes, et recalculer la mise en page de la liste à ce rythme la fait saccader.
// Dimensionnée sur le PIRE cas (champ à 5 lignes ≈ 142 + rangée de vignettes ≈ 84), pas
// sur la barre au repos : au-delà du débordement, la liste s'arrête net et cette coupure
// se voit à travers le verre de la barre.
//
// La générosité ne coûte rien : le pied de liste vaut toujours `débordement + 24`, donc
// le dernier message se pose 24 px au-dessus de la barre quelle que soit la valeur — seul
// change ce qui déborde hors écran, qui n'est jamais rendu.
const COMPOSER_OVERLAP = 240;
// Hauteurs des dégradés de flou qui adoucissent les deux bords du fil.
const HEADER_H = 62;
// Bandeau « position en direct », glissé sous le header quand un partage est en cours.
const LIVE_BANNER_H = 46;
// La carte du header se détache du fond : ombre plus large que celle des boutons.
const HEADER_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
};
const FADE_TOP = 46;
// Le champ grandit avec le texte, puis défile : au-delà, la saisie mangerait le fil.
const INPUT_LINE_H = 22;
const INPUT_MAX_LINES = 5;
const INPUT_MAX_H = INPUT_LINE_H * INPUT_MAX_LINES + 20; // + padding vertical (py-2.5)


type ConvMember = {
  userId: string;
  role: string;
  // Accusés de ce membre. Servent d'état initial : les events les entretiennent ensuite.
  lastDeliveredAt?: string | null;
  lastReadAt?: string | null;
  user: { id: string; name: string; photoUrl: string | null };
};
type ConvMeta = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  photoUrl?: string | null; // groupes
  members: ConvMember[];
  ephemeralDuration: number | null;
  myMutedUntil: string | null;
  whoCanSend?: 'all' | 'admins';
  myRole?: 'admin' | 'moderator' | 'member';
  /**
   * Premier message non lu, et combien il en reste — calculés par le SERVEUR.
   *
   * ⚠️ L'app les déduisait des messages déjà chargés, donc jamais au-delà de la dernière
   * page : avec cent messages en attente, le repère était introuvable et l'ouverture dessus
   * impossible. Seul le serveur peut les trouver sans charger tout l'historique.
   */
  firstUnreadId?: string | null;
  unreadCount?: number;
};

/** Réponse d'une fenêtre d'historique centrée sur un message. */
type AroundPage = { messages: Message[]; hasOlder: boolean; hasNewer: boolean };
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

// Regroupement des bulles : messages consécutifs d'un même auteur, dans une fenêtre courte.
// Le nom n'est rendu qu'en tête de série, l'espacement se resserre à l'intérieur.
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const GROUP_GAP = 10; // entre deux séries
const GROUP_GAP_TIGHT = 3; // à l'intérieur d'une série
// Coin situé côté « flux », entre deux messages d'une même série. Il était resserré (9), à
// la manière d'iMessage, pour signaler la continuité — mais depuis le passage des surfaces
// à 20 il tranchait avec tout le reste et se lisait comme une marche, pas comme un lien.
// Aligné sur le rayon des bulles : la série reste lisible par l'espacement resserré
// (GROUP_GAP_TIGHT contre GROUP_GAP), le nom affiché une seule fois en tête, et la queue
// posée sur la seule dernière bulle. Baisser cette valeur pour retrouver un indice de
// regroupement dans les coins.
const GROUP_RADIUS = RADIUS.bubble;

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
  mimeType?: string | null;
  batchId?: string | null; // médias d'un même envoi → un seul album à l'affichage
  latitude?: number | null; // `type: 'location'` — `content` porte l'adresse lisible
  longitude?: number | null;
  // Message posé localement le temps de l'envoi (voir OPTIMISTIC dans `sendMessage`).
  // `mediaUrl` pointe alors sur le fichier du téléphone, pas encore sur S3.
  pendingLocal?: boolean;
  // URL S3 obtenue une fois le téléversement fini : sert à reconnaître l'écho du serveur
  // et à remplacer le brouillon EXACTEMENT à sa place.
  pendingUploadUrl?: string | null;
};

/**
 * Nombre de médias attendus dans un album, lu DANS le `batchId`.
 *
 * ⚠️ Le compte voyage dans l'identifiant (`<userId>-<horodatage>#<n>`) plutôt que dans un
 * champ à part : `batchId` est une chaîne opaque, déjà relayée par le socket et déjà
 * stockée en base — donc ni migration, ni nouveau champ à faire accepter par le serveur.
 *
 * Le séparateur est `#` et non `-` : les identifiants d'utilisateur en contiennent, et
 * l'ancien format se terminait par un horodatage, qu'on lirait comme un compte gigantesque.
 * Sans `#`, on retombe sur 1 — donc sur le comportement d'avant, ce que font les albums
 * déjà en base.
 */
const batchExpected = (batchId?: string | null) => {
  if (!batchId) return 1;
  const hash = batchId.lastIndexOf('#');
  if (hash === -1) return 1;
  const n = Number(batchId.slice(hash + 1));
  return Number.isInteger(n) && n > 1 ? n : 1;
};

// Une réponse à une story porte déjà son propre en-tête (« X a répondu à votre story »)
// avec le nom : on la laisse hors des séries, en amont comme en aval.
/**
 * Ajoute des messages au fil en écartant ceux qu'il contient déjà.
 *
 * ⚠️ Filet volontaire, et non un pansement sur un bug précis. Le fil est alimenté par cinq
 * chemins — historique, pagination, socket, rattrapage à la reconnexion, albums mis de côté
 * — qui peuvent se recouvrir : une page à cheval sur la précédente, un message arrivé à la
 * fois par le socket et par un rechargement. Un doublon ne dégrade pas l'affichage, il le
 * CASSE (clés dupliquées, cellules omises), donc la garantie doit vivre ici, à l'entrée, et
 * pas dans chaque appelant.
 */
const mergeMessages = (prev: Message[], incoming: Message[], position: 'start' | 'end') => {
  const known = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (!fresh.length) return prev;
  return position === 'start' ? [...fresh, ...prev] : [...prev, ...fresh];
};

const isStoryReplyMsg = (m?: Message) => !!m && (m.type === 'story_reply' || !!m.storyMediaUrl);

// Une ligne de la liste : un message seul, ou les médias d'un même envoi (album).
type Row = { key: string; messages: Message[] };

// `a` précède `b` dans la liste (ordre chronologique).
const sameGroup = (a?: Message, b?: Message) =>
  !!a &&
  !!b &&
  a.type !== 'system' &&
  b.type !== 'system' &&
  !isStoryReplyMsg(a) &&
  !isStoryReplyMsg(b) &&
  !!a.sender?.id &&
  a.sender.id === b.sender?.id &&
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < GROUP_WINDOW_MS;

// Le conteneur de bulle doit être animé pour porter l'entrée.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Deux ressorts par bulle plutôt qu'un : le déplacement se pose net (amorti), l'échelle
// garde un léger rebond. Les faire diverger est ce qui donne de la matière à l'entrée —
// un ressort unique produit un mouvement plat, tout part et s'arrête ensemble.
const SPRING_MINE = {
  pos: { damping: 16, stiffness: 260, mass: 0.6 }, // envoi : vif, il doit se sentir
  scale: { damping: 12, stiffness: 300, mass: 0.6 },
};
const SPRING_THEIRS = {
  pos: { damping: 17, stiffness: 200, mass: 0.7 }, // réception : plus posée, jamais brusque
  scale: { damping: 13, stiffness: 210, mass: 0.7 },
};

// ⚠️ L'entrée est jouée depuis un effet de montage, PAS via les layout animations
// (`entering`) : dans une FlatList les cellules sont montées/recyclées par la
// virtualisation, à travers le CellRendererComponent de RN, et `entering` ne s'y
// déclenche pas. Un effet de montage, lui, suit exactement l'apparition de la bulle.
type MessageEnterProps = {
  messageId: string;
  // ⚠️ Le marquage « déjà vu » doit se faire au montage de CETTE bulle, pas au rendu de la
  // liste : passé la hauteur d'un écran, VirtualizedList monte les cellules par lots
  // (updateCellsBatchingPeriod), donc plusieurs frames après le setMessages qui les ajoute.
  seenIds: { current: Set<string> };
  isMe: boolean;
  className: string;
  style: StyleProp<ViewStyle>;
  /** Absent tant que le message n'existe pas côté serveur (brouillon d'envoi). */
  onLongPress?: () => void;
  children: React.ReactNode;
};

function MessageEnter({
  messageId,
  seenIds,
  isMe,
  className,
  style,
  onLongPress,
  children,
}: MessageEnterProps) {
  // Première apparition à l'écran de ce message ? (l'historique est pré-marqué au chargement)
  const animate = !seenIds.current.has(messageId);
  // 0 = état d'arrivée, 1 = en place. Le ressort de `sc` dépasse 1 → petit « pop » final.
  const pos = useSharedValue(animate ? 0 : 1); // déplacement + opacité
  const sc = useSharedValue(animate ? 0 : 1); // échelle
  useEffect(() => {
    seenIds.current.add(messageId);
    if (!animate) return;
    const spring = isMe ? SPRING_MINE : SPRING_THEIRS;
    pos.value = withSpring(1, spring.pos);
    sc.value = withSpring(1, spring.scale);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const anim = useAnimatedStyle(() => ({
    // Fade plus rapide que le déplacement : la bulle est lisible avant d'être posée.
    opacity: Math.min(1, pos.value * 2.4),
    transform: isMe
      ? [{ translateY: 16 * (1 - pos.value) }, { scale: 0.86 + 0.14 * sc.value }]
      : [
          // Reçue : arrive en diagonale depuis son coin d'ancrage, pas d'un simple côté.
          { translateX: -10 * (1 - pos.value) },
          { translateY: 10 * (1 - pos.value) },
          { scale: 0.88 + 0.12 * sc.value },
        ],
  }));

  return (
    <AnimatedPressable
      onLongPress={onLongPress}
      delayLongPress={300}
      className={className}
      // La bulle éclot depuis son coin bas (côté expéditeur) au lieu de son centre :
      // elle semble sortir du fil plutôt que d'apparaître par-dessus.
      style={[{ transformOrigin: isMe ? 'bottom right' : 'bottom left' }, style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Voile d'envoi posé sur un média en cours de téléversement.
 *
 * Le média occupe déjà sa place définitive : il ne reste qu'à dire que sa mise à
 * disposition est en cours. D'où un simple voile par-dessus, sans rien déplacer — c'est le
 * déplacement, pas l'attente, qui rendait l'envoi désagréable à regarder.
 *
 * ⚠️ Un assombrissement posé PAR-DESSUS, et non une opacité sur la bulle : baisser
 * l'opacité du conteneur délaverait aussi le dégradé, l'ombre et l'indicateur lui-même.
 */
function SendingVeil() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, ROUND.bubble]}
      className="items-center justify-center bg-black/25"
    >
      <View className="w-9 h-9 rounded-full bg-black/55 items-center justify-center">
        <ActivityIndicator size="small" color="white" />
      </View>
    </View>
  );
}

/**
 * Repère « reprendre ici » : trait continu portant le nombre de messages restant à lire.
 *
 * Posé DANS le fil, à sa place chronologique, et non en bandeau flottant : c'est un point
 * du fil qu'on doit pouvoir dépasser en défilant, pas une information qui suit l'écran.
 */
function UnreadDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center my-3 px-1">
      <View className="flex-1 h-px bg-nexa/30" />
      <Text className="text-nexa text-xs font-semibold mx-2.5">{label}</Text>
      <View className="flex-1 h-px bg-nexa/30" />
    </View>
  );
}

// Queue de bulle : triangle accolé au coin bas, côté expéditeur. Dessiné avec des
// bordures (une View 0×0 dont un seul côté est coloré) — react-native-svg n'est pas
// installé et l'ajouter imposerait un rebuild natif pour un ornement de 9 px.
const TAIL_W = 9;
const TAIL_H = 13;
// Coin porteur de la queue : parfaitement droit. Au moindre arrondi, le bord de la bulle
// rentre vers l'intérieur alors que la queue part du bord théorique — et l'appendice
// semble décollé.
const TAIL_CORNER = 0;
// Chevauchement de la queue sur la bulle : garantit la continuité, ombre comprise.
const TAIL_OVERLAP = 2;

/**
 * Remplissage dégradé d'une bulle « moi ».
 *
 * ⚠️ Posé en couche absolue et NON via `overflow: 'hidden'` sur la bulle : ce dernier
 * clipperait la queue, qui déborde volontairement du cadre. La couche reprend donc les
 * mêmes rayons que la bulle pour épouser ses coins.
 */
function BubbleFill({ color, radius }: { color: string; radius: object }) {
  const [from, to] = bubbleGradient(color);
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[from, to]}
      // Légèrement diagonal : un dégradé strictement vertical paraît plat sur une surface
      // aussi courte qu'une bulle.
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[StyleSheet.absoluteFill, ROUND.bubble, radius]}
    />
  );
}

// Heure d'envoi, au format local de l'appareil.
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Heure affichée dans une bulle.
 *
 * `overlay` la pose en pastille sur le média : sur une image sans légende, une ligne
 * ajoutée sous la photo créerait une bande vide au seul usage de l'horodatage.
 */
/**
 * État d'acheminement d'un message, affiché contre l'heure — la place qu'occupent les
 * coches de WhatsApp.
 *
 * Premier cran d'une échelle destinée à s'allonger : `sending` (horloge) → `sent` (une
 * coche) → à venir `delivered` (deux coches) et `read` (deux coches bleues), quand les
 * accusés de réception existeront côté serveur. D'où un statut nommé plutôt qu'un booléen
 * « en cours » : les crans suivants s'ajoutent ici, sans toucher aux bulles.
 *
 * ⚠️ Pas d'état d'ÉCHEC. Le socket met les envois en tampon et les rejoue à la reconnexion
 * (`reconnection: true`, pas de mode `volatile` dans `lib/socket.ts`) : annoncer un échec
 * pour un message qui va partir serait faux, et proposer un renvoi en enverrait deux. Le
 * seul cas de perte réelle — app tuée hors ligne, le tampon vivant en mémoire — demande une
 * file d'attente persistée, pas un indicateur.
 */
type SendStatus = 'sending' | 'sent' | 'delivered' | 'read';

// Bleu des accusés de LECTURE. Volontairement plus clair que le bleu nexa : posé sur une
// bulle déjà bleue, l'accent de marque s'y noierait.
const READ_BLUE = '#38BDF8';

// ⚠️ Emplacement de largeur FIXE. Les trois icônes ne font pas la même largeur
// (`time-outline` 12, `checkmark` 13, `checkmark-done` 15) : sans lui, la ligne de l'heure
// s'élargissait au passage à la double coche et la bulle entière grandissait avec elle.
// Calé sur la plus large.
const STATUS_SLOT = 15;

function StatusIcon({ status, tone }: { status: SendStatus; tone: string }) {
  return (
    <View style={{ width: STATUS_SLOT }} className="items-center">
      {status === 'sending' ? (
        <Ionicons name="time-outline" size={12} color={tone} />
      ) : status === 'sent' ? (
        <Ionicons name="checkmark" size={13} color={tone} />
      ) : (
        // Reçu et vu partagent la double coche : seule la couleur les distingue.
        <Ionicons name="checkmark-done" size={15} color={status === 'read' ? READ_BLUE : tone} />
      )}
    </View>
  );
}

function BubbleTime({
  iso,
  isMe,
  overlay = false,
  status,
}: {
  iso: string;
  isMe: boolean;
  overlay?: boolean;
  /** Absent sur les messages reçus : on n'accuse que ses propres envois. */
  status?: SendStatus;
}) {
  if (overlay) {
    return (
      <View className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5">
        <Text className="text-[10px] text-white">{formatTime(iso)}</Text>
        {status && <StatusIcon status={status} tone="rgba(255,255,255,0.85)" />}
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1 self-end mt-0.5">
      <Text
        className={`text-[11px] ${isMe ? 'text-white/70' : 'text-gray-400 dark:text-zinc-500'}`}
      >
        {formatTime(iso)}
      </Text>
      {status && <StatusIcon status={status} tone={isMe ? 'rgba(255,255,255,0.7)' : '#9CA3AF'} />}
    </View>
  );
}

function BubbleTail({ isMe, color }: { isMe: boolean; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 0,
        ...(isMe
          ? { right: -(TAIL_W - TAIL_OVERLAP) }
          : { left: -(TAIL_W - TAIL_OVERLAP) }),
        width: 0,
        height: 0,
        borderBottomWidth: TAIL_H,
        borderBottomColor: color,
        ...(isMe
          ? { borderRightWidth: TAIL_W, borderRightColor: 'transparent' }
          : { borderLeftWidth: TAIL_W, borderLeftColor: 'transparent' }),
      }}
    />
  );
}

// Coins resserrés du côté où la série se poursuit ; en fin de série, le coin bas
// s'aplatit pour accueillir la queue.
const bubbleRadius = (isMe: boolean, first: boolean, last: boolean) => ({
  ...(first ? null : isMe ? { borderTopRightRadius: GROUP_RADIUS } : { borderTopLeftRadius: GROUP_RADIUS }),
  ...(last
    ? isMe
      ? { borderBottomRightRadius: TAIL_CORNER }
      : { borderBottomLeftRadius: TAIL_CORNER }
    : isMe
      ? { borderBottomRightRadius: GROUP_RADIUS }
      : { borderBottomLeftRadius: GROUP_RADIUS }),
});

type MediaPayload = {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'gif';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationMs?: number;
  batchId?: string;
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
  const scheme = useColorScheme();
  // La zone de saisie est suivie de la bande de safe area : sans l'inclure dans le
  // débordement, la liste s'arrête avant le bord de l'écran et les messages y sont
  // tranchés net, à découvert. Cette valeur ne bouge pas d'un rendu à l'autre, elle
  // n'entraîne donc aucun recalcul répété de la mise en page.
  const insets = useSafeAreaInsets();
  const composerOverlap = COMPOSER_OVERLAP + insets.bottom;
  // `photo` et `type` viennent de l'écran appelant, qui les connaît déjà : l'en-tête est
  // donc juste dès la première image, au lieu de montrer l'initiale puis de basculer sur
  // la photo une fois le profil chargé. Facultatifs — tous les appelants ne les ont pas.
  const { id, name, photo, type: typeParam } = useLocalSearchParams<{
    id: string;
    name: string;
    photo?: string;
    type?: string;
  }>();

  // Traduit un message système (content JSON { k, by, ... }) selon la langue du lecteur.
  const systemText = (raw?: string | null): string => {
    if (!raw) return '';
    try {
      const { k, dur, ...params } = JSON.parse(raw);
      if (dur) params.duration = t(`ephemeral.${dur}`) as string;
      if (params.role) params.role = t(`roles.${params.role}`) as string;
      return t(`system.${k}`, params) as string;
    } catch {
      return '';
    }
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  /**
   * Indicateur de chargement de la page precedente, piloté par une shared value.
   *
   * ⚠️ C'était un état React, et il coûtait DEUX rendus complets de l'écran par page
   * chargée (vrai puis faux). Or `renderItem` est recréé à chaque rendu du parent : chacun
   * de ces rendus repassait sur TOUTES les cellules visibles — pile au moment où la liste
   * insère 30 messages et recalcule sa position. C'était une part du sursaut.
   *
   * L'indicateur reste monté en permanence, à hauteur fixe : seule son opacité change, sur
   * le thread UI. Aucun rendu React, aucune variation de mise en page.
   */
  const olderOpacity = useSharedValue(0);
  const olderStyle = useAnimatedStyle(() => ({ opacity: olderOpacity.value }));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Amorcés par les paramètres de route : sans ça, un groupe s'affichait d'abord comme une
  // conversation directe (initiale sur pastille) avant de basculer sur son avatar.
  const [convType, setConvType] = useState<'direct' | 'group'>(
    typeParam === 'group' ? 'group' : 'direct',
  );
  // ⚠️ `|| null` et non `?? null` : un paramètre de route absent arrive en chaîne VIDE, que
  // `??` laisserait passer — `UserAvatar` recevrait alors une URL vide au lieu de retomber
  // sur l'initiale.
  /**
   * Nom tel que le serveur le connaît.
   *
   * ⚠️ Le nom d'en-tête ne venait QUE du paramètre de route. Ça marchait tant qu'on
   * arrivait depuis un écran qui le connaissait — mais pas depuis une NOTIFICATION, qui
   * n'en passe aucun : l'en-tête restait vide et l'avatar affichait « ? », y compris une
   * fois la conversation chargée. L'écran doit pouvoir se nommer lui-même.
   */
  /**
   * Repère de reprise, tel que le SERVEUR l'a désigné à l'ouverture : identifiant du premier
   * message non lu, et combien il en reste.
   *
   * ⚠️ Remplace le calcul local qui comparait les dates des messages CHARGÉS à ma dernière
   * lecture. Il ne pouvait rien voir au-delà de la page en mémoire, et demandait en plus un
   * plafond pour ne pas compter les messages arrivés pendant qu'on lisait. Une valeur figée
   * par le serveur résout les deux d'un coup.
   */
  const [unreadInfo, setUnreadInfo] = useState<{ id: string; count: number } | null>(null);
  const [fetchedName, setFetchedName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState<string | null>(
    typeParam === 'group' ? photo || null : null,
  );
  const [whoCanSend, setWhoCanSend] = useState<'all' | 'admins'>('all');
  const [myRole, setMyRole] = useState<'admin' | 'moderator' | 'member'>('member');
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
  /**
   * Accusés des AUTRES membres, par utilisateur.
   *
   * ⚠️ Une carte par membre et non deux dates globales : en groupe, un message n'est
   * « reçu » que lorsque TOUS l'ont reçu. Se contenter du dernier événement afficherait la
   * double coche dès le premier destinataire servi. On garde donc le détail et on prend le
   * PLUS ANCIEN au moment d'afficher.
   *
   * Ce n'est pas un état par message : la comparaison se fait sur la date du message, donc
   * une seule mise à jour repeint toutes les bulles sans les parcourir.
   */
  const [receipts, setReceipts] = useState<Record<string, { delivered?: string; read?: string }>>(
    {},
  );

  /**
   * Bornes d'acheminement : le PLUS ANCIEN accusé parmi les autres membres, et `null` dès
   * qu'un seul n'a rien — sans quoi un groupe passerait « reçu » au premier destinataire
   * servi. En conversation directe il n'y a qu'un membre, donc c'est simplement sa date.
   */
  const { deliveredBound, readBound } = useMemo(() => {
    const rows = Object.values(receipts);
    const earliest = (pick: (r: { delivered?: string; read?: string }) => string | undefined) => {
      if (!rows.length || rows.some((r) => !pick(r))) return null;
      return Math.min(...rows.map((r) => new Date(pick(r) as string).getTime()));
    };
    return { deliveredBound: earliest((r) => r.delivered), readBound: earliest((r) => r.read) };
  }, [receipts]);

  /** Cran atteint par un message, d'après sa date d'envoi. */
  const statusAt = useCallback(
    (iso: string): SendStatus => {
      const at = new Date(iso).getTime();
      if (readBound !== null && at <= readBound) return 'read';
      if (deliveredBound !== null && at <= deliveredBound) return 'delivered';
      return 'sent';
    },
    [deliveredBound, readBound],
  );
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flags>({ pinned: [], starred: [] });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const typingSentRef = useRef(false); // a-t-on déjà signalé qu'on écrit ?
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null); // arrêt auto de notre frappe
  const peerTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null); // masquage auto (5 s)
  const otherUserIdRef = useRef<string | null>(null); // pour filtrer les events présence
  const atBottomRef = useRef(true); // l'utilisateur est-il collé au bas ? (auto-scroll conditionnel)
  // Pièces jointes / médias (Phase D)
  const [viewer, setViewer] = useState<{ type: 'image' | 'video'; url: string } | null>(null);
  const [albumView, setAlbumView] = useState<{ items: AlbumItem[]; index: number } | null>(
    null,
  );
  const [giphyOpen, setGiphyOpen] = useState(false);
  const [locationPicker, setLocationPicker] = useState(false);
  const [viewLocation, setViewLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string | null;
  } | null>(null);
  // Participants (moi exclu) qui diffusent leur position ici. Une liste d'identifiants et
  // non un compteur : les relevés arrivent en rafale, un compteur dériverait.
  const [liveShares, setLiveShares] = useState<string[]>([]);
  const myLiveExpiry = useMyLiveShare(id);
  const liveBannerVisible = !!myLiveExpiry || liveShares.length > 0;
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, setPending] = useState<PendingMedia[]>([]); // médias choisis, pas encore envoyés
  const plusRotation = useSharedValue(0);
  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotation.value}deg` }],
  }));
  // Ids déjà affichés : une bulle ne joue son entrée qu'à sa première apparition réelle
  // (message qui arrive), jamais pour l'historique ni au recyclage des lignes par la FlatList.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef(false); // l'utilisateur a le doigt sur la liste → on ne le contrarie pas
  const smoothNextRef = useRef(false); // le prochain repositionnement suit un message qui arrive
  const smoothingRef = useRef(false); // un défilement animé est en cours : ne pas le couper
  const distanceRef = useRef(0); // pixels restants sous le bas de l'écran (maj à chaque scroll)
  const followUntilRef = useRef(0); // fin de la fenêtre « collé au bas » armée par un envoi
  // Pagination vers le haut : le fil ne charge qu'une page à l'ouverture (les plus récents).
  const messagesRef = useRef<Message[]>([]); // dernière liste connue, sans redéclencher les callbacks
  const loadingOlderRef = useRef(false); // une page est déjà en vol → ne pas en redemander
  const hasOlderRef = useRef(true); // faux dès qu'une page revient incomplète : on est au début
  /**
   * Reste-t-il des messages PLUS RÉCENTS que ceux chargés ?
   *
   * ⚠️ Vrai seulement quand le fil a été ouvert au MILIEU de l'historique — sur un épinglé
   * ancien, ou sur le premier non lu quand il y en a beaucoup. Il faut alors pouvoir
   * redescendre jusqu'au présent, sans quoi le bas du fil serait un cul-de-sac.
   */
  const hasNewerRef = useRef(false);
  const loadingNewerRef = useRef(false);

  // Ouverture du fil : on le garde INVISIBLE tant qu'il n'est pas calé.
  //
  // La liste étant désormais inversée, l'ouverture EN BAS n'a plus besoin de ce voile :
  // elle s'y rend nativement, à l'offset zéro, sans passer par le début de la conversation.
  //
  // ⚠️ Il reste néanmoins nécessaire pour l'ouverture SUR LE REPÈRE de reprise, qui exige
  // un `scrollToIndex` vers une ligne pas encore montée : ce calage-là, lui, se voit. Il
  // est conservé pour les deux cas plutôt que conditionné — un fil qui apparaît de deux
  // façons différentes selon qu'on a des messages en attente se remarquerait davantage que
  // le fondu lui-même.
  const listReveal = useSharedValue(0);
  const revealedRef = useRef(false);
  const listRevealStyle = useAnimatedStyle(() => ({ opacity: listReveal.value }));
  const revealList = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    openTargetRef.current = null;
    pendingScrollRef.current = null;
    // Fondu court : la position est déjà bonne, il ne sert qu'à éviter l'apparition sèche.
    listReveal.value = withTiming(1, { duration: 140 });
  }, [listReveal]);

  // Repoussé à CHAQUE changement de taille du contenu, donc déclenché par le DERNIER :
  // les cellules sont montées par lots et le contenu grandit plusieurs fois de suite.
  // Dévoiler au premier montrerait une position intermédiaire — le saut qu'on veut cacher.
  /**
   * Ligne à viser à l'ouverture, quand des messages n'ont pas été lus.
   *
   * ⚠️ Une ref et non un état : elle est lue depuis `onContentSizeChange`, qui se déclenche
   * plusieurs fois pendant que les cellules se montent. Un état provoquerait un rendu de
   * la liste à chaque fois, en plein calage.
   *
   * Vidée au dévoilement : passé ce point, le fil reprend son comportement normal — suivre
   * le bas quand on y est.
   */
  const openTargetRef = useRef<string | null>(null);
  const openDecidedRef = useRef(false);
  /**
   * Repère effectivement affiché, FIGÉ à l'ouverture.
   *
   * ⚠️ Le calcul se rejoue à chaque changement du fil, donc aussi quand une page d'anciens
   * messages arrive : le repère pouvait apparaître à ce moment-là et insérer sa hauteur au
   * milieu du fil, décalant d'un coup tout ce qui se trouvait en dessous — le sursaut qu'on
   * voyait en remontant.
   *
   * Contrepartie assumée : si la frontière était au-dessus de la première page, le repère
   * n'apparaîtra pas en remontant. C'est justement le cas où l'on n'a pas pu ouvrir dessus,
   * donc où il n'aurait de toute façon pas servi de point de reprise.
   */
  const [divider, setDivider] = useState<{ key: string; count: number } | null>(null);

  /**
   * Défilement ciblé en cours, conservé pour pouvoir le RETENTER.
   *
   * ⚠️ Sans `getItemLayout` — impossible, les hauteurs de bulles sont variables —
   * `scrollToIndex` échoue tant que la cellule visée n'est pas montée. Avant l'inversion ce
   * cas ne se présentait presque jamais : les messages ANCIENS étaient aux petits indices,
   * donc toujours rendus (une liste virtualisée rend d'abord son début). Depuis
   * l'inversion, l'indice 0 est le message le plus RÉCENT — un épinglé ou un repère un peu
   * ancien se retrouve loin dans la liste, non monté, et l'appel échoue silencieusement.
   */
  /**
   * Message à rejoindre dès que la fenêtre chargée autour de lui aura été rendue.
   *
   * ⚠️ En deux temps, obligatoirement : `scrollToRow` cherche son index dans `displayRows`,
   * qui n'existe qu'après le rendu suivant le remplacement des messages.
   */
  const pendingJumpRef = useRef<string | null>(null);
  // Dernière demande de saut : périme les réponses d'une demande précédente.
  const jumpRequestRef = useRef<string | null>(null);
  // ⚠️ Minuterie du surlignage tenue dans une ref : rendue par l'effet, elle était purgée
  // par son propre nettoyage au rendu suivant, avant d'avoir pu s'exécuter.
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingScrollRef = useRef<{
    key: string;
    viewPosition: number;
    viewOffset: number;
    animated: boolean;
    tries: number;
  } | null>(null);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReveal = useCallback(() => {
    if (revealedRef.current) return;
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    // Couvre le dernier passage de calage de `scrollToBottom` (jusqu'à 120 ms).
    revealTimerRef.current = setTimeout(() => {
      // Un calage ciblé est encore en cours de reprise : dévoiler maintenant le montrerait
      // à l'écran. Le plafond dur reste le garde-fou.
      if (pendingScrollRef.current) {
        scheduleReveal();
        return;
      }
      revealList();
    }, 160);
  }, [revealList]);

  // Plafond dur : le fil doit apparaître même si les mesures s'enchaînent sans fin, si le
  // chargement échoue ou si la liste ne grandit jamais. Un écran resté vide serait bien
  // pire que le saut qu'on corrige.
  useEffect(() => {
    // Relevé : les reprises de calage peuvent prendre plusieurs lots de 120 ms.
    const cap = setTimeout(revealList, 1400);
    return () => {
      clearTimeout(cap);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [revealList]);

  // Brouillon local : la bulle est posée AVANT que le serveur ne la connaisse, pour que la
  // mise en page soit définitive dès le premier instant. Voir OPTIMISTIC dans `sendMessage`.
  const draftSeqRef = useRef(0);
  const newDraftId = () => `local-${Date.now()}-${draftSeqRef.current++}`;

  const pushDraft = useCallback((draft: Message) => {
    // Marqué vu AVANT le rendu : le brouillon joue l'animation d'entrée, pas la vraie bulle
    // qui viendra le remplacer — sinon le message clignoterait à l'écho.
    seenIdsRef.current.add(draft.id);
    setMessages((prev) => mergeMessages(prev, [draft], 'end'));
    atBottomRef.current = true;
    followUntilRef.current = Date.now() + FOLLOW_WINDOW_MS;
  }, []);

  /** Squelette commun à tous les brouillons ; l'appelant complète selon le type. */
  const makeDraft = useCallback(
    (fields: Partial<Message>): Message => ({
      id: newDraftId(),
      content: '',
      createdAt: new Date().toISOString(),
      // Le nom ne sert pas : un brouillon est toujours de nous, donc jamais titré.
      sender: { id: currentUserId ?? '', name: '' },
      conversationId: id,
      pendingLocal: true,
      ...fields,
    }),
    [currentUserId, id],
  );

  const dropDraft = useCallback((draftId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== draftId));
  }, []);

  /** Lie le brouillon à l'URL S3 : c'est par elle qu'on reconnaîtra l'écho du serveur. */
  const linkDraft = useCallback((draftId: string, url: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === draftId ? { ...m, pendingUploadUrl: url } : m)),
    );
  }, []);

  // Réception d'un album : on retient les médias jusqu'à ce qu'il soit complet.
  //
  // ⚠️ L'expéditeur envoie N messages DISTINCTS (un message ne porte qu'une pièce jointe),
  // espacés par la durée de chaque téléversement. Les afficher à l'arrivée faisait tomber
  // les images une par une, avec un saut de mise en page à chacune. Aucun délai fixe ne
  // peut deviner la fin de l'album — d'où le compte transmis dans le `batchId`.
  const albumBufRef = useRef(new Map<string, Message[]>());
  const albumTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const flushAlbum = useCallback((batchId: string) => {
    const timer = albumTimerRef.current.get(batchId);
    if (timer) clearTimeout(timer);
    albumTimerRef.current.delete(batchId);
    const items = albumBufRef.current.get(batchId);
    albumBufRef.current.delete(batchId);
    if (!items?.length) return;
    // L'album entier apparaît d'un coup : le rattrapage doit glisser, pas sauter.
    smoothNextRef.current = true;
    setMessages((prev) => mergeMessages(prev, items, 'end'));
  }, []);

  // Les minuteries survivraient à la sortie de l'écran et écriraient dans un état démonté.
  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      for (const t of albumTimerRef.current.values()) clearTimeout(t);
      albumTimerRef.current.clear();
      albumBufRef.current.clear();
    },
    [],
  );

  // Faut-il ramener le fil en bas ? Soit on y est déjà, soit on vient d'envoyer et la
  // fenêtre de suivi couvre les mesures qui arrivent encore.
  const shouldStick = useCallback(
    // ⚠️ `hasNewerRef` : après un saut au milieu de l'historique, le bas du contenu CHARGÉ
    // n'est pas le bas de la conversation. S'y coller ramènerait l'utilisateur au bout de
    // chaque page fraîchement chargée, contre son défilement. Le suivi reprend dès que le
    // vrai bas est atteint.
    () => (atBottomRef.current && !hasNewerRef.current) || followUntilRef.current > Date.now(),
    [],
  );

  // Unique point de repositionnement du fil.
  //
  // ⚠️ Liste INVERSÉE : le bas du fil — le message le plus récent — est à l'offset ZÉRO, et
  // non à la fin du contenu. D'où `scrollToOffset({ offset: 0 })` partout ici ; `scrollToEnd`
  // mènerait au message le plus ANCIEN.
  //
  // Deux raisons de repasser plusieurs fois :
  // - la virtualisation monte les cellules par lots, donc le contenu grandit APRÈS le
  //   premier scroll (les hauteurs des bulles sont variables, donc estimées jusqu'à mesure) ;
  // - un média (image, GIF) finit de charger et pousse encore le contenu.
  // Chaque passe se re-teste : dès que l'utilisateur touche la liste, on s'arrête.
  const scrollToBottom = useCallback((animated = false) => {
    const settle = () => {
      if (shouldStick() && !draggingRef.current) {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    };
    // Un défilement animé est en cours : les changements de taille qui suivent (cellules
    // montées par lots) ne doivent PAS déclencher un saut, sinon ils l'interrompent.
    if (smoothingRef.current) return;
    if (!shouldStick() || draggingRef.current) return;

    listRef.current?.scrollToOffset({ offset: 0, animated });

    if (animated) {
      // On laisse l'animation se dérouler, puis un seul calage à la fin — et en douceur :
      // un saut instantané juste après le glissement se voit comme un à-coup.
      // S'il ne reste rien à rattraper, on ne touche à rien du tout.
      smoothingRef.current = true;
      setTimeout(() => {
        smoothingRef.current = false;
        // ⚠️ On ne re-teste PAS `atBottomRef` ici : pendant que le glissement était
        // protégé, la nouvelle bulle a fini d'être montée et le contenu a grandi, si bien
        // que la distance au bas repasse au-dessus du seuil et que le drapeau retombe à
        // faux. Abandonner alors laisserait le message envoyé sous la zone de saisie. Un
        // mouvement lancé volontairement doit être mené à son terme ; seul le geste de
        // l'utilisateur peut l'annuler.
        if (draggingRef.current) return;
        // ⚠️ Aucune condition de distance ici : `distanceRef` vient du dernier événement
        // de défilement, et il n'en arrive plus une fois le glissement fini — la valeur
        // date donc d'AVANT que la nouvelle bulle soit mesurée, et vaut ~0 alors qu'il
        // reste sa hauteur à parcourir. S'y fier faisait renoncer au calage, laissant le
        // message envoyé sous la zone de saisie. Ce dernier passage est animé : s'il n'y a
        // rien à rattraper, il ne se voit pas.
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, SMOOTH_SCROLL_MS);
    } else {
      requestAnimationFrame(settle);
      setTimeout(settle, 120);
    }
  }, [shouldStick]);

  // Le fil garde la liste dans un ref : `loadOlder` la lit sans dépendre de l'état, ce qui
  // le garderait sinon recréé à chaque message reçu — et la FlatList avec lui.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /**
   * Page suivante vers le passé (`?cursor=<id du plus ancien affiché>`, 30 par page).
   *
   * ⚠️ Les anciens messages sont marqués « déjà vus » avant d'être posés : sans cela, toute
   * la page jouerait l'animation d'entrée réservée aux messages qui arrivent.
   */
  /**
   * Remplace tout le fil, en tenant `messagesRef` à jour DANS LE MÊME TEMPS.
   *
   * ⚠️ La ref était jusqu'ici écrite par un effet, donc APRÈS le rendu. Entre les deux,
   * `loadNewer` — déclenché par le défilement — lisait encore l'ANCIENNE liste et demandait
   * au serveur les messages postérieurs à son dernier. Or celui-ci était déjà le dernier de
   * la conversation : le serveur répondait 0, ce qui était pris pour « il n'y a plus rien »
   * et coupait la pagination descendante DÉFINITIVEMENT.
   *
   * Toute substitution du fil doit donc passer par ici, jamais par `setMessages` seul.
   */
  const replaceMessages = useCallback((next: Message[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasOlderRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;

    loadingOlderRef.current = true;
    olderOpacity.value = withTiming(1, { duration: 120 });
    try {
      const page = await apiRequest<Message[]>(
        `/conversations/${id}/messages?cursor=${oldest.id}`,
      );
      // Page incomplète = début de la conversation atteint, on ne redemandera plus.
      if (page.length < MESSAGES_PAGE) hasOlderRef.current = false;
      if (page.length) {
        for (const m of page) seenIdsRef.current.add(m.id);
        // Le serveur renvoie du plus récent au plus ancien : on remet dans l'ordre du fil.
        setMessages((prev) => mergeMessages(prev, page.slice().reverse(), 'start'));
      }
    } catch {
      // Réseau : on laisse `hasOlderRef` à vrai, le prochain passage près du haut réessaiera.
    } finally {
      loadingOlderRef.current = false;
      olderOpacity.value = withTiming(0, { duration: 120 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * Charge les messages plus RÉCENTS, quand le fil a été ouvert au milieu de l'historique.
   *
   * ⚠️ Liste inversée : le présent est au DÉBUT de la liste, d'où `onStartReached`. C'est le
   * pendant exact de `loadOlder`, et il n'a de sens que si `hasNewerRef` est vrai.
   */
  const loadNewer = useCallback(async () => {
    if (loadingNewerRef.current || !hasNewerRef.current) return;
    const newest = messagesRef.current[messagesRef.current.length - 1];
    if (!newest) return;

    loadingNewerRef.current = true;
    try {
      const page = await apiRequest<Message[]>(
        `/conversations/${id}/messages?newerCursor=${newest.id}`,
      );
      if (page.length < MESSAGES_PAGE) hasNewerRef.current = false;
      if (page.length) {
        for (const m of page) seenIdsRef.current.add(m.id);
        setMessages((prev) => mergeMessages(prev, page.slice().reverse(), 'end'));
      }
    } catch {
      // Réseau : on garde `hasNewerRef` à vrai, le prochain passage réessaiera.
    } finally {
      loadingNewerRef.current = false;
    }
  }, [id]);

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

  // Tant que la conversation est à l'écran, ses messages sont lus au fil de l'eau : le
  // badge de l'onglet Discussion doit les ignorer.
  useEffect(() => {
    setActiveConversation(id);
    return () => setActiveConversation(null);
  }, [id]);

  useEffect(() => {
    const init = async () => {
      try {
        const me = await apiRequest<{ id: string }>('/users/me');
        setCurrentUserId(me.id);

        // Métadonnées de la conversation → identifier l'autre participant (conv directe).
        const meta = await apiRequest<ConvMeta>(`/conversations/${id}`);
        setConvType(meta.type);
        setGroupPhoto(meta.photoUrl ?? null);
        setEphemeralDuration(meta.ephemeralDuration);
        setMutedUntil(meta.myMutedUntil);
        setWhoCanSend(meta.whoCanSend ?? 'all');
        setMyRole(meta.myRole ?? 'member');
        // ⚠️ Lu ICI, avant le `POST /read` de l'ouverture : après, le serveur aurait déjà
        // écrasé la date de lecture et ne saurait plus dire où le repère se pose.
        setUnreadInfo(
          meta.firstUnreadId ? { id: meta.firstUnreadId, count: meta.unreadCount ?? 0 } : null,
        );
        // Groupe : son nom. Direct : celui de l'autre participant.
        setFetchedName(
          meta.type === 'group'
            ? meta.name ?? ''
            : meta.members.find((m) => m.userId !== me.id)?.user.name ?? '',
        );
        // État initial des accusés, à partir des autres membres.
        setReceipts(
          Object.fromEntries(
            meta.members
              .filter((m) => m.userId !== me.id)
              .map((m) => [
                m.userId,
                { delivered: m.lastDeliveredAt ?? undefined, read: m.lastReadAt ?? undefined },
              ]),
          ),
        );
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

        /**
         * ⚠️ Quand il reste des messages non lus, on ne charge PAS la dernière page mais une
         * fenêtre centrée sur le premier d'entre eux. C'est la seule façon d'ouvrir dessus :
         * on ne peut pas défiler vers une ligne absente de la liste, et remonter page par
         * page jusqu'à elle serait interminable au-delà de quelques dizaines de messages.
         *
         * La fenêtre porte largement vers le présent (`after`), pour que tout ce qui a été
         * manqué soit là et se lise d'une traite en descendant. Au-delà de cette borne,
         * `hasNewer` prend le relais et la suite se charge en défilant.
         */
        const history = meta.firstUnreadId
          ? await (async () => {
              const page = await apiRequest<AroundPage>(
                `/conversations/${id}/messages/around/${meta.firstUnreadId}?before=15&after=150`,
              );
              hasOlderRef.current = page.hasOlder;
              hasNewerRef.current = page.hasNewer;
              return page.messages;
            })()
          : await (async () => {
              const page = await apiRequest<Message[]>(`/conversations/${id}/messages`);
              // Page pleine = il reste probablement de l'historique ; page incomplète = on
              // tient déjà toute la conversation.
              hasOlderRef.current = page.length >= MESSAGES_PAGE;
              hasNewerRef.current = false;
              return page;
            })();
        // Marqué AVANT le rendu : sinon tout l'historique s'animerait à l'ouverture.
        for (const m of history) seenIdsRef.current.add(m.id);
        // Le fil s'ouvre en bas, et doit y rester le temps que les bulles soient mesurées.
        followUntilRef.current = Date.now() + OPEN_FOLLOW_WINDOW_MS;
        replaceMessages(history.reverse());
        // Rien à mesurer ni à caler : inutile de faire attendre l'écran vide.
        if (!history.length) revealList();

        // La conversation est ouverte : tout ce qui précède est lu.
        apiRequest(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});

        const socket = await connectSocket();
        socket.emit('join_conversation', id);

        socket.on('new_message', (msg: Message) => {
          if (msg.conversationId === id || !msg.conversationId) {
            const mine = msg.sender?.id === me.id;
            const expected = batchExpected(msg.batchId);
            // Album reçu d'un autre : on le met de côté jusqu'à l'avoir en entier. Nos
            // propres envois sont exclus — ils ont déjà leur brouillon à l'écran, les
            // retenir le laisserait en « envoi » alors que le serveur a répondu.
            if (!mine && expected > 1 && msg.batchId) {
              const key = msg.batchId;
              const buf = albumBufRef.current.get(key) ?? [];
              buf.push(msg);
              albumBufRef.current.set(key, buf);
              if (buf.length >= expected) {
                flushAlbum(key);
              } else if (!albumTimerRef.current.has(key)) {
                albumTimerRef.current.set(key, setTimeout(() => flushAlbum(key), ALBUM_WAIT_MS));
              }
              // La conversation est ouverte : le message est lu, même pas encore affiché.
              apiRequest(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
              return;
            }
            setMessages((prev) => {
              // Écho d'un média qu'on vient d'envoyer : le brouillon cède sa place EXACTE.
              // ⚠️ Remplacer sur place et non « retirer puis ajouter à la fin » : la vraie
              // bulle arrive pendant que les suivantes sont encore en téléversement, et
              // l'ajouter en queue réordonnerait l'album sous les yeux de l'utilisateur.
              const draft = msg.mediaUrl
                ? prev.findIndex((m) => m.pendingLocal && m.pendingUploadUrl === msg.mediaUrl)
                : // Texte seul : pas de téléversement, donc aucune URL sur laquelle
                  // raccrocher l'écho — on apparie sur le contenu, et UNIQUEMENT pour nos
                  // propres envois : le correspondant peut très bien écrire le même mot.
                  // Deux messages identiques d'affilée peuvent s'apparier dans le désordre,
                  // sans conséquence visible puisque les bulles sont identiques.
                  mine
                  ? prev.findIndex((m) => m.pendingLocal && !m.mediaUrl && m.content === msg.content)
                  : -1;
              if (draft !== -1) {
                seenIdsRef.current.add(msg.id); // le brouillon a déjà joué l'entrée
                const next = [...prev];
                // ⚠️ On garde le fichier LOCAL comme source affichée. Basculer sur l'URL S3
                // ferait recharger l'image depuis le réseau, donc clignoter — soit
                // précisément ce qu'on cherche à supprimer. Tout le reste vient du serveur
                // (identifiant réel, donc épinglage et favoris fonctionnels), et la
                // prochaine ouverture de la conversation servira l'URL distante.
                next[draft] = { ...msg, mediaUrl: prev[draft].mediaUrl };
                return next;
              }
              /**
               * ⚠️ Le fil est ouvert sur une fenêtre du MILIEU de l'historique (saut vers un
               * épinglé ancien) : ce message est le plus récent de la conversation, mais il
               * ne suit PAS celui qui ferme la fenêtre. L'ajouter le collerait à un voisin
               * qui n'est pas le sien et créerait un trou invisible dans le fil.
               * `loadNewer` le rapportera à sa place quand on redescendra.
               */
              if (hasNewerRef.current) return prev;
              return mergeMessages(prev, [msg], 'end');
            });
            // Message reçu alors qu'on lit la conversation → lu immédiatement,
            // sinon il ressortirait comme non lu au retour sur la liste.
            if (msg.sender?.id !== me.id) {
              apiRequest(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
            }
            // On se contente d'armer le suivi : envoyer un message ramène toujours en bas,
            // recevoir n'y ramène que si on y était déjà (sinon on couperait la lecture).
            // Le repositionnement lui-même est fait par onContentSizeChange, une fois la
            // bulle montée — deux scrolls concurrents s'interrompaient l'un l'autre.
            if (msg.sender?.id === me.id) {
              atBottomRef.current = true;
              // Couvre les mesures tardives d'une bulle haute (cf. FOLLOW_WINDOW_MS).
              followUntilRef.current = Date.now() + FOLLOW_WINDOW_MS;
            }
            // Ce repositionnement-là accompagne une bulle qui apparaît : il doit glisser,
            // pas sauter. (À l'ouverture du chat, au contraire, le calage reste immédiat.)
            smoothNextRef.current = true;
          }
        });

        // Accusés de réception et de lecture (voir `receipts`). Deux events distincts, mais
        // « lu » implique « reçu » : le serveur pose les deux dates, on fait de même ici
        // pour qu'une lecture ne laisse jamais une bulle en simple coche.
        const applyReceipt = (
          e: { conversationId: string; userId: string; at: string },
          kind: 'delivered' | 'read',
        ) => {
          if (e.conversationId !== id || e.userId === me.id) return;
          setReceipts((prev) => ({
            ...prev,
            [e.userId]: {
              ...prev[e.userId],
              delivered: e.at,
              ...(kind === 'read' ? { read: e.at } : {}),
            },
          }));
        };
        socket.on('conversation_delivered', (e: any) => applyReceipt(e, 'delivered'));
        socket.on('conversation_read', (e: any) => applyReceipt(e, 'read'));

        socket.on('removed_from_group', ({ conversationId }: { conversationId: string }) => {
          if (conversationId === id) router.replace('/(tabs)');
        });

        // Message supprimé (par l'auteur ou un admin/modérateur) → le retirer.
        socket.on(
          'message_deleted',
          ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
            if (conversationId === id) {
              setMessages((prev) => prev.filter((m) => m.id !== messageId));
            }
          },
        );

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

        // Partages de position des autres : on ne garde que le compte, la carte étant sur
        // son propre écran. Le mien est suivi par `useMyLiveShare`, pas par le serveur.
        apiRequest<{ userId: string }[]>(`/conversations/${id}/live-locations`)
          .then((list) =>
            setLiveShares(list.filter((l) => l.userId !== me.id).map((l) => l.userId)),
          )
          .catch(() => {});

        socket.on('live_location', (e: { conversationId: string; userId: string }) => {
          if (e.conversationId !== id || e.userId === me.id) return;
          setLiveShares((prev) => (prev.includes(e.userId) ? prev : [...prev, e.userId]));
        });
        socket.on(
          'live_location_ended',
          (e: { conversationId: string; userId: string }) => {
            if (e.conversationId !== id) return;
            setLiveShares((prev) => prev.filter((u) => u !== e.userId));
          },
        );

        // Photo du groupe changée (par moi depuis les détails, ou par un autre admin) :
        // le header suit sans qu'on ait à rouvrir la conversation.
        socket.on(
          'group_updated',
          (d: { conversationId: string; name?: string; photoUrl?: string | null }) => {
            if (d.conversationId !== id) return;
            setGroupPhoto(d.photoUrl ?? null);
            // Le nom aussi : sans ça, un groupe renommé gardait son ancien titre jusqu'à
            // la prochaine ouverture de l'écran.
            if (d.name) setFetchedName(d.name);
          },
        );

        // Reconnexion — retour au premier plan, ou réseau retrouvé. La conversation a été
        // quittée côté serveur en même temps que la connexion : sans ce rattrapage, l'écran
        // resterait ouvert sans plus rien recevoir, et sans les messages arrivés entre-temps.
        /**
         * Rattrapage à la reconnexion — retour au premier plan, ou réseau retrouvé.
         *
         * ⚠️ Ce chemin repose le REPÈRE de reprise, comme au montage de l'écran. Sans cela,
         * quitter l'app en laissant la conversation ouverte puis y revenir rechargeait
         * l'historique et marquait tout comme lu SANS jamais repasser par la logique
         * d'ouverture — celle-ci ne tournant qu'au montage. Les messages arrivés entre-temps
         * étaient donc lus avant d'avoir pu être signalés, et le repère ne pouvait plus
         * apparaître. C'est pourtant le cas le plus courant : on quitte l'app, on la
         * rouvre, elle revient là où on l'avait laissée.
         */
        socket.on('connect', () => {
          socket.emit('join_conversation', id);
          (async () => {
            const fresh = await apiRequest<ConvMeta>(`/conversations/${id}`);
            setUnreadInfo(
              fresh.firstUnreadId
                ? { id: fresh.firstUnreadId, count: fresh.unreadCount ?? 0 }
                : null,
            );

            const history = fresh.firstUnreadId
              ? await (async () => {
                  const page = await apiRequest<AroundPage>(
                    `/conversations/${id}/messages/around/${fresh.firstUnreadId}?before=15&after=150`,
                  );
                  hasOlderRef.current = page.hasOlder;
                  hasNewerRef.current = page.hasNewer;
                  return page.messages;
                })()
              : await (async () => {
                  const page = await apiRequest<Message[]>(`/conversations/${id}/messages`);
                  hasOlderRef.current = page.length >= MESSAGES_PAGE;
                  hasNewerRef.current = false;
                  return page;
                })();

            // Marqués avant le rendu : ce sont des messages rattrapés, pas des arrivées en
            // direct — les animer ferait défiler tout l'historique.
            for (const m of history) seenIdsRef.current.add(m.id);
            // Rouvre la décision de calage : le fil vient d'être remplacé, et le repère
            // peut désigner une autre ligne qu'à la dernière ouverture.
            openDecidedRef.current = false;
            replaceMessages(history.reverse());
            apiRequest(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
          })().catch(() => {});
        });
      } catch {
        router.replace('/(tabs)');
      }
    };

    init();

    return () => {
      const socket = getSocket();
      socket?.off('new_message');
      socket?.off('conversation_delivered');
      socket?.off('conversation_read');
      socket?.off('removed_from_group');
      socket?.off('message_deleted');
      socket?.off('peer_typing');
      socket?.off('presence_update');
      socket?.off('group_updated');
      socket?.off('live_location');
      socket?.off('live_location_ended');
      socket?.off('connect');
      // On arrête proprement notre propre indicateur de frappe.
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      if (peerTypingRef.current) clearTimeout(peerTypingRef.current);
      if (typingSentRef.current) {
        socket?.emit('typing', { conversationId: id, typing: false });
        typingSentRef.current = false;
      }
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

  const sendMessage = async () => {
    const content = text.trim();
    const queue = pending;
    if (!content && queue.length === 0) return;
    const socket = getSocket();
    if (!socket) return;

    // Tap haptique dès le départ, sans attendre l'écho serveur.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // La barre se vide tout de suite : l'envoi est acté, les uploads suivent en fond.
    setText('');
    setPending([]);
    stopTyping(socket);

    if (queue.length === 0) {
      // Texte seul : aucun téléversement, mais le brouillon reste utile — sur un réseau
      // lent la bulle apparaît quand même tout de suite, avec son horloge.
      pushDraft(makeDraft({ content }));
      socket.emit('send_message', { conversationId: id, content });
      return;
    }

    // Un message ne porte qu'une pièce jointe : N médias = N messages, envoyés dans
    // l'ordre choisi, et le texte accompagne le dernier — comme WhatsApp. Tous partagent
    // un `batchId` : c'est lui qui les réunit en un seul album à l'affichage (et non un
    // intervalle de temps, qui grouperait aussi des envois distincts rapprochés).
    // Le compte est suffixé pour que le destinataire sache combien de médias attendre avant
    // d'afficher l'album (cf. `batchExpected`).
    const batchId =
      queue.length > 1 ? `${currentUserId}-${Date.now()}#${queue.length}` : undefined;

    // OPTIMISTIC — l'album est posé ENTIER, tout de suite, avec les fichiers du téléphone.
    //
    // ⚠️ Sans ça, chaque média n'apparaissait qu'une fois téléversé : les images tombaient
    // une par une et la légende arrivait en dernier, en faisant sauter la mise en page à
    // chaque étape. Le brouillon montre d'emblée la forme finale ; les vraies bulles
    // prendront sa place sans que rien ne bouge.
    //
    // Les brouillons portent le MÊME `batchId` que les messages à venir : c'est ce qui les
    // réunit en un seul album, y compris pendant le remplacement où les deux cohabitent.
    const drafts: Message[] = queue.map((item, i) =>
      makeDraft({
        content: i === queue.length - 1 ? content : '',
        mediaUrl: item.uri,
        mediaType: item.mediaType,
        mimeType: item.contentType,
        durationMs: item.durationMs,
        batchId,
      }),
    );
    for (const d of drafts) pushDraft(d);

    setUploading(true);
    let failed = 0;
    let captionSent = false;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const isLast = i === queue.length - 1;
      const draftId = drafts[i].id;
      try {
        const url = await uploadFile(item.uri, item.contentType, 'chat');
        // L'écho du serveur est reconnu par cette URL : elle est notre seul lien avec la
        // vraie bulle, l'identifiant du message étant attribué côté serveur.
        linkDraft(draftId, url);
        sendMedia(
          {
            mediaUrl: url,
            mediaType: item.mediaType,
            mimeType: item.contentType,
            durationMs: item.durationMs,
            batchId,
          },
          isLast ? content : '',
        );
        if (isLast) captionSent = true;
      } catch {
        failed++;
        // Le brouillon n'aura jamais d'écho : le retirer, sinon il resterait en « envoi »
        // pour toujours.
        dropDraft(draftId);
      }
    }
    setUploading(false);

    // Le média porteur de la légende a échoué : le texte ne doit pas disparaître avec lui.
    if (content && !captionSent) {
      socket.emit('send_message', { conversationId: id, content });
    }
    if (failed) Alert.alert(t('error'), t('media.upload_error'));
  };

  // --- Médias / pièces jointes ---
  const sendMedia = (payload: MediaPayload, caption = '') => {
    getSocket()?.emit('send_message', { conversationId: id, content: caption, ...payload });
  };

  // Un asset du picker → entrée de la zone d'attente (rien n'est envoyé à ce stade).
  const toPending = (asset: ImagePicker.ImagePickerAsset): PendingMedia => {
    const isVideo = asset.type === 'video';
    return {
      id: `${asset.assetId ?? asset.uri}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      uri: asset.uri,
      mediaType: isVideo ? 'video' : 'image',
      contentType: isVideo
        ? asset.mimeType?.startsWith('video/')
          ? asset.mimeType
          : 'video/mp4'
        : 'image/jpeg',
      durationMs: asset.duration ? Math.round(asset.duration) : undefined,
    };
  };

  // Ajoute en respectant le plafond global (la zone peut déjà contenir des médias venus
  // d'une autre source), et prévient si la sélection a dû être tronquée.
  const addPending = (assets: ImagePicker.ImagePickerAsset[]) => {
    setPending((prev) => {
      const room = MAX_PENDING - prev.length;
      if (assets.length > room) {
        Alert.alert('', t('media.max_selection', { count: MAX_PENDING }));
      }
      return [...prev, ...assets.slice(0, room).map(toPending)];
    });
  };

  const removePending = (pendingId: string) =>
    setPending((prev) => prev.filter((p) => p.id !== pendingId));

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const room = MAX_PENDING - pending.length;
    if (room <= 0) {
      Alert.alert('', t('media.max_selection', { count: MAX_PENDING }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: room,
    });
    if (result.canceled) return;
    addPending(result.assets);
  };

  // Caméra directe : photo ou vidéo prise sur le moment, qui rejoint la même zone
  // d'attente. (Les stories, elles, passent par StoryCamera — caméra in-app avec gestes.)
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('media.camera_permission'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (result.canceled) return;
    addPending(result.assets);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'application/pdf';
    // Nom, taille et type sont connus localement : la carte de fichier est donc IDENTIQUE
    // à sa version finale dès maintenant, seule sa mise à disposition manque.
    const draft = makeDraft({
      mediaUrl: asset.uri,
      mediaType: 'document',
      fileName: asset.name,
      fileSize: asset.size ?? undefined,
      mimeType: contentType,
    });
    pushDraft(draft);
    setUploading(true);
    try {
      const url = await uploadFile(asset.uri, contentType, 'chat');
      linkDraft(draft.id, url);
      sendMedia({
        mediaUrl: url,
        mediaType: 'document',
        fileName: asset.name,
        fileSize: asset.size ?? undefined,
        mimeType: contentType,
      });
    } catch {
      dropDraft(draft.id);
      Alert.alert(t('error'), t('media.upload_error'));
    } finally {
      setUploading(false);
    }
  };

  const onGifSelect = (url: string) => {
    setGiphyOpen(false);
    sendMedia({ mediaUrl: url, mediaType: 'gif' });
  };

  /**
   * Choix de la durée, puis démarrage du partage en direct.
   *
   * Une durée est demandée à chaque fois, sans valeur par défaut : diffuser sa position
   * n'est pas anodin, autant que ce soit un choix conscient.
   */
  const askLiveDuration = () => {
    Alert.alert(t('live.action'), t('live.duration_question'), [
      ...LIVE_DURATIONS.map((seconds) => ({
        text: t(`live.duration_${seconds}`),
        onPress: async () => {
          const result = await startLiveShare(id, seconds);
          // Permission « Toujours » refusée : le partage marche, mais s'interrompt dès que
          // l'app quitte l'écran. Le dire tout de suite, plutôt que de laisser croire à un
          // suivi continu qui figerait la position sans prévenir.
          if (result.ok) {
            if (!result.background) {
              Alert.alert(t('live.foreground_only_title'), t('live.foreground_only'));
            }
            return;
          }
          Alert.alert(
            t('location.error_title'),
            t('location.denied'),
            result.canAskAgain
              ? undefined
              : [
                  { text: t('cancel'), style: 'cancel' as const },
                  { text: t('location.open_settings'), onPress: () => Linking.openSettings() },
                ],
          );
        },
      })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  /**
   * Envoie un point de la carte. Rien à téléverser : les coordonnées voyagent avec le
   * message, et `content` porte l'adresse lisible — c'est elle qu'on affiche sous
   * l'aperçu et dans la liste des conversations.
   */
  const sendLocation = ({ latitude, longitude, address }: PickedLocation) => {
    getSocket()?.emit('send_message', {
      conversationId: id,
      type: 'location',
      content: address,
      latitude,
      longitude,
    });
  };

  // Le « + » pivote en croix tant que le panneau est ouvert (ressort, pas un timing
  // linéaire : le retour doit avoir le même caractère que le reste des interactions).
  const setAttach = (open: boolean) => {
    setAttachOpen(open);
    plusRotation.value = withSpring(open ? 45 : 0, { damping: 14, stiffness: 220 });
  };

  const attachActions: AttachAction[] = [
    {
      key: 'camera',
      icon: 'camera',
      color: '#1E40AF',
      label: t('media.camera'),
      onPress: takePhoto,
    },
    {
      key: 'gallery',
      icon: 'images',
      color: '#8B5CF6',
      label: t('media.gallery'),
      onPress: pickFromGallery,
    },
    {
      key: 'document',
      icon: 'document-text',
      color: '#3B82F6',
      label: t('media.document'),
      onPress: pickDocument,
    },
    {
      key: 'gif',
      icon: 'happy',
      color: '#EC4899',
      label: t('media.gif'),
      onPress: () => setGiphyOpen(true),
    },
    {
      key: 'location',
      icon: 'location',
      color: '#10B981',
      label: t('media.location'),
      onPress: () => setLocationPicker(true),
    },
    {
      key: 'live',
      icon: 'navigate',
      color: '#0EA5E9',
      label: t('live.action'),
      onPress: askLiveDuration,
    },
  ];

  // --- Message vocal ---
  // La mécanique d'enregistrement (niveaux, chrono, pause) vit dans VoiceRecorderBar ;
  // ici on ne fait qu'ouvrir la barre, puis envoyer ce qu'elle produit.
  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('media.mic_permission'));
      return;
    }
    setIsRecording(true);
  };

  const sendRecording = async (uri: string, durationMs: number) => {
    setIsRecording(false);
    // La durée est déjà connue et le fichier est local : le lecteur s'affiche complet, et
    // le vocal reste écoutable PENDANT son téléversement.
    const draft = makeDraft({
      mediaUrl: uri,
      mediaType: 'audio',
      mimeType: 'audio/m4a',
      durationMs,
    });
    pushDraft(draft);
    setUploading(true);
    try {
      const url = await uploadFile(uri, 'audio/m4a', 'chat');
      linkDraft(draft.id, url);
      sendMedia({ mediaUrl: url, mediaType: 'audio', mimeType: 'audio/m4a', durationMs });
    } catch {
      dropDraft(draft.id);
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
  const confirmDelete = (messageId: string) =>
    Alert.alert(t('chat.delete_confirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('chat.delete'),
        style: 'destructive',
        onPress: () =>
          apiRequest(`/conversations/${id}/messages/${messageId}`, { method: 'DELETE' })
            .then(() => setMessages((prev) => prev.filter((m) => m.id !== messageId)))
            .catch((e: any) => Alert.alert(t('error'), e.message)),
      },
    ]);

  const openMessageMenu = (messageId: string) => {
    const pinned = flags.pinned.includes(messageId);
    const starred = flags.starred.includes(messageId);
    const msg = messages.find((m) => m.id === messageId);
    const isMine = msg?.sender?.id === currentUserId;
    // Supprimer : mon message, ou admin/modérateur en groupe.
    const canDelete =
      isMine || (convType === 'group' && (myRole === 'admin' || myRole === 'moderator'));
    Alert.alert('', undefined, [
      {
        text: pinned ? t('details.unpin') : t('details.pin'),
        onPress: () => togglePin(messageId, pinned),
      },
      {
        text: starred ? t('details.unstar') : t('details.star'),
        onPress: () => toggleStar(messageId, starred),
      },
      ...(canDelete
        ? [{ text: t('chat.delete'), style: 'destructive' as const, onPress: () => confirmDelete(messageId) }]
        : []),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  // --- Valeurs dérivées ---
  // Le surnom local d'abord, puis le nom du serveur — qui fait foi et couvre l'ouverture
  // depuis une notification —, le paramètre de route ne servant qu'à remplir l'en-tête
  // avant la première réponse.
  const displayName = custom.nickname || fetchedName || name || '';
  const bubbleColor = resolveBubbleColor(custom.bubbleColor);
  // La queue est une View à part : elle ne peut pas hériter du `bg-white dark:bg-zinc-900`
  // des bulles reçues, il faut donc la couleur en dur (zinc-900 = #18181b).
  const theirBubble = scheme === 'dark' ? '#18181b' : '#ffffff';
  // La queue est unie : elle prend la nuance BASSE du dégradé, celle du bord auquel
  // elle s'accroche, sans quoi la jonction se voit.
  const myTailColor = bubbleGradient(bubbleColor)[1];
  // « Effacer » local : on masque les messages antérieurs à l'horodatage stocké.
  // ⚠️ Mémoïsé : sans cela, une conversation « effacée » (horodatage local) reconstruisait
  // le tableau à CHAQUE rendu, donc `rows` avec, donc `data` changeait d'identité et la
  // liste se re-rendait entièrement — à chaque frappe dans la zone de saisie comprise.
  const visibleMessages = useMemo(
    () =>
      clearedAt
        ? messages.filter((m) => new Date(m.createdAt).getTime() > clearedAt)
        : messages,
    [messages, clearedAt],
  );
  // Les médias d'un même envoi (`batchId`) sont réunis en une ligne « album » : une seule
  // bulle, une grille de vignettes, une légende. Tout le reste reste une ligne d'un
  // message. La liste est rendue à partir de ces lignes, plus des messages bruts.
  // ⚠️ Élément d'en-tête mémoïsé : écrit en ligne, il changeait d'identité à chaque rendu
  // du parent et faisait re-rendre la cellule d'en-tête de la liste pour rien.
  const listHeader = useMemo(
    () => (
            <View
              style={{
                // Rend au fil la hauteur des éléments flottants — header, et bandeau de
                // partage quand il est là — pour que le premier message ne passe pas dessous.
                height:
                  insets.top + HEADER_H + 6 + (liveBannerVisible ? LIVE_BANNER_H + 6 : 0),
                justifyContent: 'flex-end',
              }}
            >
              <Animated.View style={[{ marginBottom: 8 }, olderStyle]}>
                <ActivityIndicator size="small" color={NEXA} />
              </Animated.View>
            </View>
    ),
    [insets.top, liveBannerVisible, olderStyle],
  );

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const m of visibleMessages) {
      const groupable = !!m.batchId && isImageLike(m.mediaType) && m.type !== 'system';
      const last = out[out.length - 1];
      const lastGroupable =
        last && !!last.messages[0].batchId && isImageLike(last.messages[0].mediaType);
      if (groupable && lastGroupable && last.messages[0].batchId === m.batchId) {
        last.messages.push(m);
      } else {
        out.push({ key: m.id, messages: [m] });
      }
    }
    return out;
  }, [visibleMessages]);

  /**
   * Décide, UNE seule fois, où la conversation s'ouvre : sur le repère s'il reste des
   * messages à lire, en bas sinon.
   *
   * ⚠️ Doit désarmer la fenêtre de suivi armée au chargement de l'historique — elle force
   * le retour en bas pendant 2,5 s, et gagnerait contre le calage sur le repère.
   */
  const decideOpenTarget = useCallback((key: string | null) => {
    if (openDecidedRef.current) return;
    openDecidedRef.current = true;
    if (!key) return;
    openTargetRef.current = key;
    atBottomRef.current = false;
    followUntilRef.current = 0;
  }, []);

  /**
   * Lignes dans l'ordre d'AFFICHAGE de la liste inversée : le plus récent en premier.
   *
   * ⚠️ `rows` reste chronologique — c'est lui qui porte le regroupement des séries, la
   * détection du premier non-lu, tout ce qui raisonne « avant / après ». Seule la liste
   * consomme cet ordre retourné, et tout `scrollToIndex` doit chercher son index ICI.
   */
  const displayRows = useMemo(() => [...rows].reverse(), [rows]);

  /**
   * Unique point de défilement vers une ligne précise (repère de reprise, épinglé, favori).
   *
   * Mémorise la cible : si `scrollToIndex` échoue faute de cellule montée,
   * `onScrollToIndexFailed` s'en approche à l'estimation — ce qui force le rendu — puis
   * relance depuis ici. Sans cette reprise, l'appel échouait sans le moindre signe.
   */
  const scrollToRow = useCallback(
    (key: string, viewPosition: number, viewOffset = 0, animated = false) => {
      const index = displayRows.findIndex((r) => r.key === key);
      if (index < 0) return;
      pendingScrollRef.current = { key, viewPosition, viewOffset, animated, tries: 0 };
      listRef.current?.scrollToIndex({ index, animated, viewPosition, viewOffset });
    },
    [displayRows],
  );

  // Second temps du saut vers un message qui n'était pas chargé : la fenêtre est arrivée,
  // la liste l'a rendue, on peut enfin viser la ligne.
  useEffect(() => {
    const id = pendingJumpRef.current;
    if (!id) return;
    const row = displayRows.find((r) => r.messages.some((m) => m.id === id));
    if (!row) return;
    pendingJumpRef.current = null;
    scrollToRow(row.key, 0.5, 0, false);
    const to = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(to);
  }, [displayRows, scrollToRow]);

  /**
   * Ligne portant le repère de reprise.
   *
   * Le compte vient du serveur : il vaut le total réel, pas ce qui se trouve à l'écran.
   */
  const firstUnread = useMemo(() => {
    if (!unreadInfo) return null;
    const row = rows.find((r) => r.messages.some((m) => m.id === unreadInfo.id));
    return row ? { key: row.key, count: unreadInfo.count } : null;
  }, [rows, unreadInfo]);

  // ⚠️ Dans un effet et non pendant le rendu : `decideOpenTarget` écrit dans des refs de
  // défilement. Se déclenche au premier fil non vide — donc après le chargement de
  // l'historique, quand `firstUnread` a sa valeur définitive.
  useEffect(() => {
    if (!rows.length || openDecidedRef.current) return;
    // Figé AVANT la décision : les deux doivent désigner la même ligne.
    setDivider(firstUnread);
    decideOpenTarget(firstUnread?.key ?? null);
    // ⚠️ Le calage est lancé ICI, et pas seulement depuis `onContentSizeChange`. Cet effet
    // s'exécute APRÈS le rendu, donc après le changement de taille du contenu qui suivait
    // le chargement de l'historique : ce dernier trouvait encore la cible vide. Avant
    // l'inversion, le contenu grandissait longtemps (cellules montées par lots depuis le
    // haut) et une mesure ultérieure rattrapait le coup ; inversée, la liste se stabilise
    // tout de suite et la fenêtre était simplement ratée.
    if (firstUnread) {
      scrollToRow(firstUnread.key, 1, -(insets.top + HEADER_H + OPEN_TARGET_MARGIN));
    }
  }, [rows.length, firstUnread, decideOpenTarget, scrollToRow, insets.top]);


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
    // On va ailleurs qu'en bas : la fenêtre de suivi d'ouverture ne doit pas nous y ramener.
    followUntilRef.current = 0;
    atBottomRef.current = false;

    /**
     * ⚠️ La cible est copiée et l'état vidé TOUT DE SUITE, et cet effet n'a AUCUN nettoyage.
     *
     * Il en avait un — un drapeau « annulé » — et c'est ce qui empêchait le saut de
     * fonctionner : `setScrollTarget(null)` provoque un rendu, donc relance l'effet, donc
     * déclenche son nettoyage. La requête partait bien, mais sa réponse arrivait après
     * l'annulation et était jetée. Un effet qui vide l'état qui le déclenche ne peut pas
     * annuler son propre travail au nettoyage.
     *
     * L'obsolescence est donc suivie par une ref : seule une NOUVELLE demande de saut
     * périme la précédente.
     */
    const targetId = scrollTarget;
    setScrollTarget(null);
    jumpRequestRef.current = targetId;

    const highlight = () => {
      setHighlightId(targetId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightId(null), 2500);
    };

    // Le message est déjà en mémoire : rien à charger.
    const row = displayRows.find((r) => r.messages.some((m) => m.id === targetId));
    if (row) {
      scrollToRow(row.key, 0.5, 0, true);
      highlight();
      return;
    }

    /**
     * Message hors de la mémoire — un épinglé d'il y a un mois, typiquement. On charge une
     * fenêtre CENTRÉE sur lui : on ne peut pas défiler vers une ligne absente de la liste,
     * et remonter page par page jusqu'à elle serait interminable.
     *
     * Elle REMPLACE le contenu du fil : le chaînage avec ce qui était affiché n'existe pas
     * forcément, et le recoller donnerait un historique troué. `hasNewer` prend le relais
     * pour redescendre vers le présent.
     */
    apiRequest<AroundPage>(
      `/conversations/${id}/messages/around/${targetId}?before=25&after=25`,
    )
      .then((page) => {
        if (jumpRequestRef.current !== targetId) return; // un autre saut a été demandé depuis
        for (const m of page.messages) seenIdsRef.current.add(m.id);
        hasOlderRef.current = page.hasOlder;
        hasNewerRef.current = page.hasNewer;
        replaceMessages(page.messages.slice().reverse());
        // Calage en deux temps : `scrollToRow` cherche son index dans `displayRows`, qui
        // n'existera qu'au rendu suivant le remplacement des messages.
        pendingJumpRef.current = targetId;
        highlight();
      })
      .catch(() => {});
  }, [scrollTarget, displayRows, scrollToRow, replaceMessages, id]);

  const openDetails = () => {
    if (convType === 'group') {
      router.push({ pathname: '/group/[id]' as any, params: { id } });
      return;
    }
    if (!otherUserId) return;
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

  // ⚠️ Pas d'écran de chargement ici, volontairement. Il en existait un (indicateur centré)
  // qui n'avait AUCUN fond : on voyait donc au travers le fond du navigateur, blanc quel
  // que soit le thème — l'écran clignotait en blanc à chaque ouverture en mode sombre.
  //
  // Il n'a plus lieu d'être : tous les états ont une valeur par défaut sûre (`messages`
  // vide, `header`/`wallpaper` nuls, `convType` direct), le nom vient des paramètres de
  // route, et la liste ne se dévoile de toute façon qu'une fois calée en bas. L'écran rend
  // donc sa mise en page finale tout de suite — fond, en-tête, zone de saisie — et se
  // remplit. En cas d'échec de chargement, `init` renvoie à l'accueil.
  return (
    <View className="flex-1 bg-white dark:bg-zinc-900">
      {/* Couche de fond unique, derrière la page entière : sans elle, la bande de safe
          area et le fond du conteneur laissent un aplat sous la zone de saisie. */}
      <ChatBackground wallpaper={wallpaper} style={StyleSheet.absoluteFill} />
      {/* Seul le bas est réservé : en haut, c'est le bandeau flottant qui gère la marge
          d'écran, et laisser le SafeAreaView la poser aussi la compterait deux fois. */}
      <SafeAreaView className="flex-1" edges={['bottom']}>
      {/* Header : carte OPAQUE détachée des bords, posée sur le fil qui défile derrière.
          Hauteur fixe — le sous-titre apparaît et disparaît (frappe, présence, « vu le… »)
          et une hauteur variable ferait sauter le contenu de la liste à chaque
          changement. */}
      <View
        className="absolute bg-white dark:bg-zinc-900"
        style={{
          ...ROUND.surface,
          top: insets.top + 4,
          left: 10,
          right: 10,
          height: HEADER_H,
          zIndex: 10,
          ...HEADER_SHADOW,
        }}
      >
      <View className="flex-row items-center px-3 flex-1">
        <TouchableOpacity onPress={() => router.back()} className="px-1 py-1">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>

        {/* Avatar + point de statut */}
        <TouchableOpacity onPress={openDetails} className="ml-1">
          {convType === 'group' ? (
            <UserAvatar photoUrl={groupPhoto} size={48} group />
          ) : (
            <View>
              <UserAvatar
                // `||` et non `??` : un paramètre de route absent arrive en chaîne VIDE.
                photoUrl={header?.photoUrl || photo || null}
                name={displayName}
                size={48}
              />
              {/* vert = en ligne / gris = hors ligne */}
              <View
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-gray-400'}`}
              />
            </View>
          )}
        </TouchableOpacity>

        {/* Nom (tronqué) + sous-titre dynamique */}
        <TouchableOpacity className="flex-1 ml-3" onPress={openDetails}>
          <View className="flex-row items-center">
            <Text
              className="text-xl font-semibold text-gray-900 dark:text-zinc-100 flex-shrink"
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
              className={`text-base ${subtitleAccent ? 'text-nexa' : 'text-gray-400 dark:text-zinc-500'}`}
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
      </View>

      {/* Bandeau de partage en direct. Flottant comme le header et AU-DESSUS de lui en
          empilement (`zIndex`) : posé dans le flux, il se retrouvait derrière le dégradé de
          flou du haut du fil. Une position qui se diffuse doit rester visible en
          permanence, et coupable d'un seul geste. */}
      {liveBannerVisible && (
        <Animated.View
          // Glisse depuis le header plutôt que d'apparaître d'un bloc, et s'efface en
          // remontant. Durées seules, sans ressort : l'élément se pose sous une carte déjà
          // en place, un dépassement le ferait cogner contre elle.
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(160)}
          className="absolute"
          style={{
            top: insets.top + 4 + HEADER_H + 6,
            left: 10,
            right: 10,
            zIndex: 11,
          }}
        >
        <TouchableOpacity
          className="flex-row items-center px-4 bg-blue-50 dark:bg-blue-950"
          style={{
            ...ROUND.bubble,
            height: LIVE_BANNER_H,
            ...HEADER_SHADOW,
          }}
          onPress={() =>
            router.push({ pathname: '/chat/live' as any, params: { id, name: displayName } })
          }
          activeOpacity={0.85}
        >
          <Ionicons name="navigate" size={18} color={NEXA} />
          <Text className="flex-1 ml-2.5 text-nexa dark:text-blue-300" numberOfLines={1}>
            {myLiveExpiry
              ? t('live.sharing_for', { time: remainingLabel(myLiveExpiry) })
              : t('live.others_sharing', { count: liveShares.length })}
          </Text>
          {myLiveExpiry ? (
            <TouchableOpacity
              className="bg-red-500 rounded-full px-3 py-1.5 ml-2"
              onPress={() => stopLiveShare(id)}
            >
              <Text className="text-white text-xs font-semibold">{t('live.stop')}</Text>
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={NEXA} />
          )}
        </TouchableOpacity>
        </Animated.View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <View style={{ flex: 1, marginBottom: -composerOverlap }}>
        {/* Enveloppe porteuse du fondu d'ouverture. Posée AUTOUR de la liste et non sur
            elle : la liste doit être montée et mesurée normalement — c'est ce qui lui
            permet de se caler en bas — elle ne doit simplement pas être vue avant. */}
        <Animated.View style={[{ flex: 1 }, listRevealStyle]}>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          // ⚠️ Liste INVERSÉE. Elle se rend depuis le bas, si bien que charger de
          // l'historique devient un ajout À LA FIN — qui ne touche jamais ce qui se trouve
          // au-dessus du regard. C'est ce qui supprime le sursaut : dans une liste normale,
          // les messages insérés en tête sortent de la zone visible, y sont virtualisés avec
          // une hauteur ESTIMÉE, et chaque cellule qui se monte remplace cette estimation —
          // donc décale le point d'ancrage, une image après l'autre.
          inverted
          data={displayRows}
          // ⚠️ 10 par défaut, ce qui ne mesurait que les 10 messages les plus récents : tout
          // défilement ciblé plus haut échouait faute de cellule montée. 25 couvre
          // largement un repère de reprise ou un épinglé récent, pour un coût de montage
          // négligeable — ce sont des bulles, pas des écrans.
          initialNumToRender={25}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Pas de `gap` : l'écart est porté par chaque bulle, il varie selon le regroupement.
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14 }}
          // ⚠️ Espaces d'extrémité en ÉLÉMENTS, pas en `padding` : le débordement de la
          // liste (marginBottom négatif) place son bas sous la zone de saisie, et il faut
          // rendre au fil exactement cette hauteur. Un en-tête ou un pied de liste est un
          // enfant réel, donc mesuré et compté dans la taille du contenu — ce dont dépend
          // le calage, alors qu'un padding de conteneur ne l'était pas ici.
          // ⚠️ Les deux extrémités sont ÉCHANGÉES par l'inversion : l'en-tête de liste
          // s'affiche en BAS de l'écran, le pied en HAUT. L'espace réservé à la carte
          // d'en-tête flottante devient donc le PIED, et le débordement sous la zone de
          // saisie devient l'EN-TÊTE. Les intervertir est l'erreur la plus facile à
          // commettre ici, et elle ne se voit qu'aux extrémités du fil.
          ListHeaderComponent={<View style={{ height: composerOverlap + 24 }} />}
          ListFooterComponent={listHeader}
          // L'historique est désormais à la FIN du contenu : c'est `onEndReached` qui le
          // charge, et `maintainVisibleContentPosition` n'a plus lieu d'être — on n'insère
          // plus rien au-dessus de ce qu'on regarde.
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          // ⚠️ Liste inversée : le DÉBUT, c'est le présent. Sert quand le fil a été ouvert au
          // milieu de l'historique (repère de reprise, saut vers un épinglé ancien) et qu'il
          // faut pouvoir redescendre jusqu'au bas — sans quoi ce serait un cul-de-sac.
          onStartReached={loadNewer}
          onStartReachedThreshold={0.4}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            // Marge volontairement large : entre deux passes de calage, le contenu a déjà
            // grandi d'une bulle. Un seuil serré ferait basculer « plus en bas » à ce
            // moment-là et couperait le suivi juste après l'avoir armé. C'est le geste de
            // l'utilisateur, pas la mesure au pixel, qui doit arrêter le suivi.
            // ⚠️ Liste inversée : le bas du fil est à l'offset ZÉRO. La distance au bas
            // est donc l'offset lui-même, et non ce qu'il reste de contenu en dessous.
            const distance = contentOffset.y;
            distanceRef.current = distance;
            atBottomRef.current = distance < 100;

            // ⚠️ Chargement des messages plus RÉCENTS déclenché ici, et pas seulement par
            // `onStartReached` : celui-ci ne se déclenche pas de façon fiable sur une liste
            // inversée, si bien qu'après un saut au milieu de l'historique on ne pouvait
            // plus redescendre jusqu'au présent. La mesure nécessaire est déjà calculée
            // au-dessus, autant s'en servir. `loadNewer` se garde lui-même contre les
            // appels concurrents et sort tout de suite s'il n'y a rien de plus récent.
            if (distance < layoutMeasurement.height * 1.5) loadNewer();
          }}
          // Le doigt sur la liste prime sur tout repositionnement automatique.
          onScrollBeginDrag={() => {
            draggingRef.current = true;
            // L'utilisateur reprend la main : la fenêtre de suivi s'arrête là, et un
            // défilement ciblé encore en cours de reprise ne doit pas lui repasser devant.
            followUntilRef.current = 0;
            pendingScrollRef.current = null;
          }}
          onScrollEndDrag={() => {
            draggingRef.current = false;
          }}
          onMomentumScrollEnd={() => {
            draggingRef.current = false;
          }}
          // Seul déclencheur du suivi : le contenu vient de grandir (message, média chargé,
          // clavier). `scrollToBottom` décide s'il faut suivre et repasse jusqu'à se caler.
          onContentSizeChange={() => {
            // Ouverture sur le repère de reprise : on vise la ligne, pas le bas. Rejoué à
            // chaque mesure tant que le fil n'est pas dévoilé — les cellules se montent par
            // lots, et la position juste n'est connue qu'une fois celles du dessus mesurées.
            if (openTargetRef.current) {
              // ⚠️ `viewPosition: 1` et non 0 : la liste étant inversée, la fin de la
              // fenêtre visible correspond au HAUT de l'écran. C'est là qu'on veut le
              // repère, pour lire vers le bas à partir de lui.
              //
              // ⚠️ Décalage NÉGATIF, contre l'intuition. Le calcul de React Native est
              // `offset = position - viewOffset - …` : un décalage positif RÉDUIT l'offset
              // de défilement, ce qui, dans une liste inversée, remonte l'élément vers le
              // haut de l'écran — soit exactement sous la carte d'en-tête qu'on cherchait à
              // éviter. Le signe opposé le repousse sous elle.
              scrollToRow(
                openTargetRef.current,
                1,
                -(insets.top + HEADER_H + OPEN_TARGET_MARGIN),
              );
              scheduleReveal();
              return;
            }
            // Pendant la fenêtre de suivi, le rattrapage reste animé : la mesure d'une
            // bulle haute déplace le fil de plusieurs centaines de pixels, et un saut sec
            // juste après le glissement d'entrée se verrait comme un à-coup.
            const smooth = smoothNextRef.current || followUntilRef.current > Date.now();
            smoothNextRef.current = false;
            scrollToBottom(smooth);
            scheduleReveal();
          }}
          // Filet de sécurité à l'ouverture : le contentSize peut arriver avant que la liste
          // ait sa hauteur → on force une fois le positionnement en bas au premier layout.
          onLayout={() => {
            if (openTargetRef.current) return; // le calage sur le repère s'en charge
            scrollToBottom();
          }}
          renderItem={({ item: row, index }: { item: Row; index: number }) => {
            const album = row.messages.length > 1 ? row.messages : null;
            // Un album reste « en envoi » tant qu'un seul de ses médias l'est : il ne doit
            // pas s'éclaircir par morceaux au fil des téléversements.
            const sending = row.messages.some((m) => m.pendingLocal);
            const item = row.messages[0];

            // Bandeau système centré (rejoint le groupe, éphémères, etc.)
            if (item.type === 'system') {
              return (
                <View className="items-center my-2 px-6">
                  <Text className="text-sm text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded-full px-3.5 py-1.5 text-center">
                    {systemText(item.content)}
                  </Text>
                </View>
              );
            }
            const isMe = item.sender?.id === currentUserId;
            const isStoryReply = isStoryReplyMsg(item);
            const reaction = isStoryReply && isEmojiOnly(item.content);
            // Position dans la série : pilote le nom, l'écart au précédent et les coins.
            // On compare de ligne à ligne, en prenant les messages qui se font face.
            //
            // ⚠️ `index` parcourt `displayRows`, retourné par l'inversion : le message
            // chronologiquement PRÉCÉDENT est donc à `index + 1`, et le SUIVANT à
            // `index - 1`. Les intervertir ne casse rien de visible immédiatement — les
            // séries se regroupent simplement à l'envers, nom en pied de série et queue de
            // bulle sur le mauvais message.
            const prevRow = displayRows[index + 1];
            const nextRow = displayRows[index - 1];
            const firstOfGroup = !sameGroup(prevRow?.messages[prevRow.messages.length - 1], item);
            const lastOfGroup = !sameGroup(row.messages[row.messages.length - 1], nextRow?.messages[0]);
            const radius = bubbleRadius(isMe, firstOfGroup, lastOfGroup);
            // On n'accuse que ses propres envois — d'où l'absence de statut sur les
            // messages reçus.
            const sendStatus: SendStatus | undefined = !isMe
              ? undefined
              : sending
                ? 'sending'
                : statusAt(item.createdAt);
            // Sur un album, ces marqueurs valent pour la ligne entière : un seul média
            // épinglé suffit à la signaler.
            const isPinned = row.messages.some((m) => flags.pinned.includes(m.id));
            const isStarred = row.messages.some((m) => flags.starred.includes(m.id));
            const highlighted = row.messages.some((m) => m.id === highlightId);
            // La légende d'un album est portée par le dernier média qui en a une.
            const albumCaption = album
              ? [...album].reverse().find((m) => m.content)?.content ?? ''
              : '';

            return (
              <>
              {/* Repère de reprise de lecture, posé juste avant le premier message non lu. */}
              {divider?.key === row.key && (
                <UnreadDivider
                  label={t(
                    divider.count === 1 ? 'chat.new_messages_one' : 'chat.new_messages_other',
                    { count: divider.count },
                  )}
                />
              )}
              <MessageEnter
                messageId={item.id}
                seenIds={seenIdsRef}
                isMe={isMe}
                // Pas de menu sur un brouillon : son identifiant est local, épingler ou
                // mettre en favori s'adresserait à un message que le serveur ne connaît pas.
                onLongPress={sending ? undefined : () => openMessageMenu(item.id)}
                className={`max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                style={[
                  {
                    // ⚠️ Pas d'écart au-dessus du message le plus ANCIEN, qui ouvre le fil.
                    // Avec l'inversion il est en dernière position, plus en première.
                    marginTop:
                      index === displayRows.length - 1
                        ? 0
                        : firstOfGroup
                          ? GROUP_GAP
                          : GROUP_GAP_TIGHT,
                  },
                  highlighted
                    ? // Concentrique avec la bulle qu'il entoure : rayon de la bulle + son écart.
                      {
                        backgroundColor: 'rgba(250,204,21,0.25)',
                        borderRadius: RADIUS.bubble + 2,
                        borderCurve: 'continuous' as const,
                        padding: 2,
                      }
                    : null,
                ]}
              >
                {(isPinned || isStarred) && (
                  <View
                    className={`flex-row items-center gap-1 mb-0.5 px-1 ${isMe ? 'flex-row-reverse' : ''}`}
                  >
                    {isPinned && <Ionicons name="pin" size={12} color="#9CA3AF" />}
                    {isStarred && <Ionicons name="star" size={12} color="#F59E0B" />}
                  </View>
                )}
                {album ? (
                  <>
                    {!isMe && firstOfGroup && (
                      <Text className="text-base text-gray-400 dark:text-zinc-500 mb-1 ml-1">
                        {item.sender?.name}
                      </Text>
                    )}
                    <View
                      style={[BUBBLE_SHADOW, ROUND.bubble, radius]}
                      className={`p-1 ${isMe ? '' : 'bg-white dark:bg-zinc-900'}`}
                    >
                      {isMe && <BubbleFill color={bubbleColor} radius={radius} />}
                      <MediaGrid
                        items={album.map((m) => ({
                          id: m.id,
                          mediaUrl: m.mediaUrl as string,
                          mediaType: m.mediaType,
                        }))}
                        onOpen={(i) =>
                          setAlbumView({
                            items: album.map((m) => ({
                              id: m.id,
                              mediaUrl: m.mediaUrl as string,
                              mediaType: m.mediaType,
                            })),
                            index: i,
                          })
                        }
                        onLongPressItem={sending ? () => {} : openMessageMenu}
                      />
                      {albumCaption ? (
                        <View className="px-2 pt-1.5 pb-0.5">
                          <Text
                            className={`text-base ${isMe ? 'text-white' : 'text-gray-900 dark:text-zinc-100'}`}
                          >
                            {albumCaption}
                          </Text>
                          <BubbleTime iso={album[album.length - 1].createdAt} isMe={isMe} status={sendStatus} />
                        </View>
                      ) : (
                        <BubbleTime iso={album[album.length - 1].createdAt} isMe={isMe} overlay status={sendStatus} />
                      )}
                      {lastOfGroup && <BubbleTail isMe={isMe} color={isMe ? myTailColor : theirBubble} />}
                      {sending && <SendingVeil />}
                    </View>
                  </>
                ) : item.type === 'location' &&
                  item.latitude != null &&
                  item.longitude != null ? (
                  <>
                    {!isMe && firstOfGroup && (
                      <Text className="text-base text-gray-400 dark:text-zinc-500 mb-1 ml-1">
                        {item.sender?.name}
                      </Text>
                    )}
                    {/* Aperçu hors bulle, comme les médias : la carte se suffit à elle-même. */}
                    <View style={[BUBBLE_SHADOW, ROUND.bubble]} className="overflow-hidden">
                      <LocationBubble
                        latitude={item.latitude}
                        longitude={item.longitude}
                        address={item.content}
                        onPress={() =>
                          setViewLocation({
                            latitude: item.latitude!,
                            longitude: item.longitude!,
                            address: item.content,
                          })
                        }
                      />
                    </View>
                    <BubbleTime iso={item.createdAt} isMe={isMe} status={sendStatus} />
                  </>
                ) : isStoryReply ? (
                  <>
                    {/* Libellé contextuel : répondu / réagi */}
                    <View
                      className={`flex-row items-center gap-1 mb-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}
                    >
                      <Ionicons name="arrow-undo" size={13} color="#9CA3AF" />
                      <Text className="text-xs text-gray-400 dark:text-zinc-500">
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
                        className="border border-gray-200 dark:border-zinc-800 bg-gray-100 dark:bg-zinc-800 mb-1"
                        style={{ ...ROUND.inner, width: 56, height: 94 }}
                      />
                    )}

                    {/* Réaction emoji en grand, ou bulle de texte */}
                    {reaction ? (
                      <Text style={{ fontSize: 56, lineHeight: 64 }} className="px-1">
                        {item.content}
                      </Text>
                    ) : (
                      <View
                        style={[BUBBLE_SHADOW, ROUND.bubble, radius]}
                        className={`px-4 py-2.5 ${isMe ? '' : 'bg-white dark:bg-zinc-900'}`}
                      >
                        {isMe && <BubbleFill color={bubbleColor} radius={radius} />}
                        <Text
                          className={`text-lg ${isMe ? 'text-white' : 'text-gray-900 dark:text-zinc-100'}`}
                        >
                          {item.content}
                        </Text>
                        <BubbleTime iso={item.createdAt} isMe={isMe} status={sendStatus} />
                      </View>
                    )}
                  </>
                ) : item.mediaUrl ? (
                  <>
                    {!isMe && firstOfGroup && (
                      <Text className="text-base text-gray-400 dark:text-zinc-500 mb-1 ml-1">{item.sender?.name}</Text>
                    )}
                    {isImageLike(item.mediaType) ? (
                      // Image/vidéo/GIF en bulle : le média affleure les bords (padding
                      // fin) et la légende vit DANS la bulle, sous le média.
                      <View
                        style={[BUBBLE_SHADOW, ROUND.bubble, radius]}
                        className={`p-1 ${isMe ? '' : 'bg-white dark:bg-zinc-900'}`}
                      >
                        {isMe && <BubbleFill color={bubbleColor} radius={radius} />}
                        <MessageMedia
                          message={item}
                          tint={bubbleColor}
                          onOpenImage={(url) => setViewer({ type: 'image', url })}
                          onOpenVideo={(url) => setViewer({ type: 'video', url })}
                        />
                        {item.content ? (
                          <View className="px-2 pt-1.5 pb-0.5">
                            <Text
                              className={`text-base ${isMe ? 'text-white' : 'text-gray-900 dark:text-zinc-100'}`}
                            >
                              {item.content}
                            </Text>
                            <BubbleTime iso={item.createdAt} isMe={isMe} status={sendStatus} />
                          </View>
                        ) : (
                          <BubbleTime iso={item.createdAt} isMe={isMe} overlay status={sendStatus} />
                        )}
                        {lastOfGroup && <BubbleTail isMe={isMe} color={isMe ? myTailColor : theirBubble} />}
                        {sending && <SendingVeil />}
                      </View>
                    ) : (
                      // Audio/document : bulle aux couleurs de l'expéditeur, avec la carte
                      // du fichier posée dessus dans un ton contrasté. Le nom de fichier
                      // et l'icône teintée gardent ainsi un fond clair sur lequel se lire,
                      // sans que la bulle ait à renoncer à sa couleur.
                      <View
                        style={[BUBBLE_SHADOW, ROUND.bubble, radius]}
                        className={`p-1.5 ${isMe ? '' : 'bg-white dark:bg-zinc-900'}`}
                      >
                        {isMe && <BubbleFill color={bubbleColor} radius={radius} />}
                        <View
                          style={ROUND.inner}
                          className={`px-3 py-2 ${isMe ? 'bg-white dark:bg-zinc-800' : 'bg-gray-100 dark:bg-zinc-800'}`}
                        >
                          <MessageMedia
                            message={item}
                            tint={bubbleColor}
                            onOpenImage={() => {}}
                            onOpenVideo={() => {}}
                          />
                        </View>
                        <BubbleTime iso={item.createdAt} isMe={isMe} status={sendStatus} />
                        {lastOfGroup && (
                          <BubbleTail isMe={isMe} color={isMe ? myTailColor : theirBubble} />
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {!isMe && firstOfGroup && (
                      <Text className="text-base text-gray-400 dark:text-zinc-500 mb-1 ml-1">{item.sender?.name}</Text>
                    )}
                    <Pressable
                      onPress={
                        firstUrl(item.content) ? () => Linking.openURL(firstUrl(item.content)!) : undefined
                      }
                      style={[BUBBLE_SHADOW, ROUND.bubble, radius]}
                      className={`px-4 py-2.5 ${isMe ? '' : 'bg-white dark:bg-zinc-900'}`}
                    >
                      {isMe && <BubbleFill color={bubbleColor} radius={radius} />}
                      <Text
                        className={`text-lg ${isMe ? 'text-white' : 'text-gray-900 dark:text-zinc-100'} ${firstUrl(item.content) ? 'underline' : ''}`}
                      >
                        {item.content}
                      </Text>
                      <BubbleTime iso={item.createdAt} isMe={isMe} status={sendStatus} />
                      {lastOfGroup && <BubbleTail isMe={isMe} color={isMe ? myTailColor : theirBubble} />}
                    </Pressable>
                  </>
                )}
              </MessageEnter>
              </>
            );
          }}
          /**
           * ⚠️ Sans `getItemLayout` — impossible ici, les hauteurs de bulles étant
           * variables — `scrollToIndex` échoue tant que la cible n'est pas montée.
           *
           * Ignorer l'échec, comme avant, marchait tant que la seule cible était un message
           * déjà à l'écran. Pour l'ouverture sur le repère, la cible peut être loin dans le
           * fil : on s'en approche à l'estimation, ce qui force son rendu, puis on retente à
           * l'image suivante. C'est le remède documenté en l'absence de `getItemLayout`.
           */
          onScrollToIndexFailed={(info) => {
            // On s'approche à l'estimation : ça force le rendu des cellules manquantes.
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            const target = pendingScrollRef.current;
            // Plafond de reprises : sur une cible introuvable, mieux vaut s'arrêter là que
            // relancer indéfiniment une liste qui n'ira jamais plus loin.
            if (!target || target.tries >= SCROLL_MAX_TRIES) {
              pendingScrollRef.current = null;
              return;
            }
            target.tries += 1;
            // ⚠️ Un délai, PAS `requestAnimationFrame`. VirtualizedList monte ses cellules
            // par lots espacés d'`updateCellsBatchingPeriod` (50 ms par défaut) : repasser à
            // l'image suivante (~16 ms) retombe sur exactement le même nombre de cellules
            // mesurées, et la reprise tourne à vide — c'est ce que montraient les traces,
            // avec `highestMeasuredFrameIndex` figé d'un essai à l'autre.
            setTimeout(() => {
              const t = pendingScrollRef.current;
              if (!t) return;
              const index = displayRows.findIndex((r) => r.key === t.key);
              if (index < 0) return;
              listRef.current?.scrollToIndex({
                index,
                animated: t.animated,
                viewPosition: t.viewPosition,
                viewOffset: t.viewOffset,
              });
            }, SCROLL_RETRY_MS);
          }}
        />
        </Animated.View>

        {/* ⚠️ Pas de dégradé de flou en bas, volontairement. Il a été essayé puis retiré :
            vivant dans le conteneur que le clavier décale, il était recomposé à chaque
            image et hachait l'animation — y compris allégé à deux couches, à hauteur fixe,
            ou monté/démonté autour du mouvement. Il faisait par ailleurs double emploi :
            le verre de la zone de saisie floute déjà les messages qui passent derrière. */}
        </View>

        {/* Bloc de saisie, en flux : c'est ce qui lui permet de suivre le clavier — un
            élément positionné en absolu ignorerait le padding du KeyboardAvoidingView. */}
        <View>
        {uploading && (
          <Text className="text-sm text-gray-400 dark:text-zinc-500 px-4 pt-1">{t('media.uploading')}</Text>
        )}

        {/* Groupe réservé aux admins : simple membre → saisie bloquée */}
        {convType === 'group' &&
        whoCanSend === 'admins' &&
        myRole !== 'admin' &&
        myRole !== 'moderator' ? (
          <View className="px-4 pb-3 pt-1 items-center">
            <GlassSurface radius={18} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text className="text-sm text-gray-500 dark:text-zinc-400 text-center">
                {t('group.only_admins_can_send')}
              </Text>
            </GlassSurface>
          </View>
        ) : isRecording ? (
          <VoiceRecorderBar onCancel={() => setIsRecording(false)} onSend={sendRecording} />
        ) : (
          /* Input */
          <>
            <PendingMediaBar items={pending} onRemove={removePending} />
            {/* Éléments posés SUR le fond de conversation : pas de barre opaque ni de
                séparateur, chaque bloc porte son propre verre dépoli. */}
            <View className="flex-row items-end px-3 pt-1 pb-2" style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => setAttach(!attachOpen)} disabled={uploading}>
                <GlassSurface radius={22} style={{ width: 44, height: 44 }}>
                  <Animated.View
                    className="w-full h-full items-center justify-center"
                    style={plusStyle}
                  >
                    <Ionicons name="add" size={26} color={NEXA} />
                  </Animated.View>
                </GlassSurface>
              </TouchableOpacity>

              <GlassSurface radius={22} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                <TextInput
                  className="px-4 py-2.5 text-lg text-gray-900 dark:text-zinc-100"
                  style={{ maxHeight: INPUT_MAX_H, lineHeight: INPUT_LINE_H }}
                  placeholder={t('chat.message_placeholder')}
                  placeholderTextColor={scheme === 'dark' ? '#71717a' : '#9ca3af'}
                  value={text}
                  onChangeText={handleChangeText}
                  multiline
                  scrollEnabled
                  textAlignVertical="top"
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                />
              </GlassSurface>

              {/* L'action principale reste pleine : c'est le seul point d'appui coloré. */}
              {text.trim() || pending.length ? (
                <TouchableOpacity
                  className="w-11 h-11 bg-nexa rounded-full items-center justify-center"
                  onPress={sendMessage}
                  disabled={uploading}
                  style={[FLOATING_SHADOW, { opacity: uploading ? 0.5 : 1 }]}
                >
                  <Ionicons name="send" size={20} color="white" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  className="w-11 h-11 bg-nexa rounded-full items-center justify-center"
                  onPress={startRecording}
                  style={FLOATING_SHADOW}
                >
                  <Ionicons name="mic" size={22} color="white" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
        </View>
      </KeyboardAvoidingView>

      {/* ⚠️ HORS du KeyboardAvoidingView : ce dégradé ne bouge pas avec le clavier, et
          l'y laisser le faisait redessiner à chaque frame de l'animation — 6 couches de
          flou masquées, de quoi hacher l'ouverture. Rendu après la liste (donc au-dessus
          d'elle) et sous le header, qui porte un zIndex. */}
      <ProgressiveBlur
        edge="top"
        height={insets.top + HEADER_H + FADE_TOP}
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
      />

      <ChatWallpaperPicker
        visible={pickerOpen}
        current={wallpaper}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectWallpaper}
      />

      {viewer && (
        <MediaViewer type={viewer.type} url={viewer.url} onClose={() => setViewer(null)} />
      )}
      {albumView && (
        <AlbumViewer
          items={albumView.items}
          initialIndex={albumView.index}
          onClose={() => setAlbumView(null)}
        />
      )}
      <GiphyPicker visible={giphyOpen} onClose={() => setGiphyOpen(false)} onSelect={onGifSelect} />

      <LocationPicker
        visible={locationPicker}
        onClose={() => setLocationPicker(false)}
        onPick={sendLocation}
      />

      {viewLocation && (
        <LocationViewer
          visible
          latitude={viewLocation.latitude}
          longitude={viewLocation.longitude}
          address={viewLocation.address}
          onClose={() => setViewLocation(null)}
        />
      )}

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttach(false)}
        title={t('media.attach')}
        comingLabel={t('media.coming_soon')}
        actions={attachActions}
      />
      </SafeAreaView>
    </View>
  );
}

// « Vu le JJ/MM à HH:MM » (utilisé par le sous-titre du header).
function formatSeen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}
