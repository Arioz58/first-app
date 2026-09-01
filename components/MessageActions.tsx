import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';
import { EmojiPicker } from './EmojiPicker';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

/**
 * Les six réactions rapides, dans l'ordre de WhatsApp.
 *
 * ⚠️ Figées et non « les plus utilisées » : une rangée dont les emojis changent de place
 * empêche le geste de devenir automatique — on vise le pouce levé de mémoire, et il doit
 * toujours être au même endroit.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * Réaction posée par un double-appui sur une bulle.
 *
 * Le pouce plutôt que le cœur : c'est le « like » de la convention Facebook/WhatsApp, et
 * c'est le premier de la rangée rapide — le geste et le menu doivent poser la MÊME chose,
 * sinon on obtient deux « likes » différents selon le chemin emprunté.
 */
export const LIKE_EMOJI = QUICK_REACTIONS[0];

/** Zone occupée à l'écran par la bulle sur laquelle le menu s'ouvre. */
export type Anchor = { x: number; y: number; width: number; height: number };

export type MessageAction =
  | 'reply'
  | 'copy'
  | 'forward'
  | 'pin'
  | 'unpin'
  | 'star'
  | 'unstar'
  | 'edit'
  | 'info'
  | 'select'
  | 'delete';

type ActionDef = {
  key: MessageAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

const ROW_H = 46;
const REACTION_BAR_H = 54;
const GAP = 8;
/** Padding horizontal du fil : la copie de la bulle doit s'aligner dessus exactement. */
const LIST_PAD = 14;

/**
 * Menu contextuel d'un message : rangée de réactions + actions.
 *
 * ⚠️ Il se place PAR RAPPORT À LA BULLE (`anchor`, mesurée à l'appui long), pas au centre de
 * l'écran : le geste vient de désigner un message précis, et un menu qui surgit ailleurs
 * oblige à retrouver des yeux ce qu'on avait sous le doigt. Au-dessus quand la bulle est
 * dans la moitié basse, en dessous sinon — pour ne jamais recouvrir ce qu'on vise.
 */
export function MessageActions({
  visible,
  anchor,
  isMine,
  actions,
  myReaction,
  preview,
  onReact,
  onAction,
  onClose,
}: {
  visible: boolean;
  anchor: Anchor | null;
  isMine: boolean;
  actions: ActionDef[];
  /** Copie de la bulle, redessinée par-dessus le voile pour qu'elle reste nette. */
  preview?: React.ReactNode;
  /** Emoji déjà posé par l'utilisateur sur ce message, s'il y en a un. */
  myReaction?: string | null;
  onReact: (emoji: string) => void;
  onAction: (action: MessageAction) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);

  const menuH = actions.length * ROW_H + 12;
  const blockH = REACTION_BAR_H + GAP + menuH;
  const MENU_W = 232;

  // ⚠️ Sans ancre — cas d'une tuile d'album, dont la grille ne mesure pas ses cases — on
  // centre plutôt que de renoncer au menu : mal placé reste utilisable, absent ne l'est pas.
  const centered = !anchor;

  // Place disponible sous la bulle, une fois la zone sûre retirée.
  const below = anchor ? SCREEN_H - insets.bottom - 12 - (anchor.y + anchor.height) : 0;
  const openBelow = !centered && below >= blockH;

  const top = centered
    ? Math.max(insets.top + 8, (SCREEN_H - blockH) / 2)
    : openBelow
      ? anchor!.y + anchor!.height + GAP
      : // Au-dessus : on remonte du bloc entier. Le `max` évite de sortir par le haut sur un
        // message très haut (album, long texte) dont le sommet est déjà hors écran.
        Math.max(insets.top + 8, anchor!.y - blockH - GAP);

  // Aligné sur le bord de la bulle du côté de son auteur — le menu prolonge le message.
  const left = centered
    ? (SCREEN_W - MENU_W) / 2
    : isMine
      ? Math.max(12, Math.min(anchor!.x + anchor!.width - MENU_W, SCREEN_W - MENU_W - 12))
      : Math.min(Math.max(12, anchor!.x), SCREEN_W - MENU_W - 12);

  const pick = (emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReact(emoji);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Fond : assombri partout, flouté sur iOS seulement — `expo-blur` coûte cher sur
          Android, et le menu est opaque, donc on ne perd rien de lisible. */}
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        {/* Capte les touches sur TOUT l'écran, y compris dans la découpe : taper le message
            ferme le menu, comme partout ailleurs. Les voiles ci-dessous sont décoratifs. */}
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} />
        {/* Voile plein. La bulle sélectionnée est REDESSINÉE par-dessus (voir `preview`) —
            on ne découpe plus le voile autour d'elle : la découpe était rectangulaire alors
            que la bulle a des coins arrondis, et le cadre se voyait à ses quatre angles. */}
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }} className="bg-black/40">
          {Platform.OS === 'ios' && (
            <BlurView intensity={12} tint="dark" style={{ position: 'absolute', inset: 0 }} />
          )}
        </View>

        {/*
          Copie exacte de la bulle, posée à la place qu'elle occupe dans le fil.
          ⚠️ Conteneur PLEINE LARGEUR avec le padding de la liste, et non calé sur `anchor.x` :
          la bulle porte `max-w-[80%]`, qui se calcule sur son parent — dans un conteneur
          réduit à sa propre largeur, elle se rétrécirait à 80 % d'elle-même.
        */}
        {anchor && preview && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: anchor.y,
              left: 0,
              right: 0,
              paddingHorizontal: LIST_PAD,
            }}
          >
            {preview}
          </View>
        )}

        <Animated.View
          entering={FadeIn.duration(160)}
          style={{
            position: 'absolute',
            top,
            left,
            width: MENU_W,
            // Le menu grandit depuis le coin le plus proche de la bulle : c'est ce qui le
            // rattache visuellement au message plutôt que de le faire apparaître de nulle part.
            //
            // ⚠️ Forme CHAÎNE (« right top »), pas tableau : dans la forme tableau, React
            // Native n'accepte que des nombres ou des pourcentages, et un mot-clé y lève
            // « Transform origin x-position must be a number » — ce qui fait planter le
            // rendu du menu entier, donc « l'appui long n'affiche rien ».
            transformOrigin: `${isMine ? 'right' : 'left'} ${openBelow ? 'top' : 'bottom'}`,
          }}
        >
          {/* Rangée de réactions rapides */}
          <View
            style={[ROUND.surface, { backgroundColor: colors.surface }]}
            className="flex-row items-center justify-between px-2 py-1.5 mb-2"
          >
            {QUICK_REACTIONS.map((emoji) => {
              const active = myReaction === emoji;
              return (
                <Pressable
                  key={emoji}
                  onPress={() => pick(emoji)}
                  hitSlop={4}
                  // Un emoji déjà posé est encerclé : c'est aussi le bouton qui le RETIRE
                  // (le serveur traite le même emoji comme un basculement).
                  className={`w-9 h-9 items-center justify-center rounded-full ${
                    active ? 'bg-blue-100 dark:bg-blue-900/40' : ''
                  }`}
                >
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setPickerOpen(true)}
              hitSlop={4}
              className="w-9 h-9 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800"
            >
              <Ionicons name="add" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {/* Actions */}
          <View
            style={[ROUND.surface, { backgroundColor: colors.surface }]}
            className="overflow-hidden py-1.5"
          >
            <ScrollView bounces={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
              {actions.map((a) => (
                <Pressable
                  key={a.key}
                  // ⚠️ On NE ferme PAS ici avant d'agir : une action qui ouvre une feuille
                  // (Transférer) la présenterait pendant que ce Modal se démonte, et iOS
                  // laisse alors un modal fantôme — invisible, alors que tout le reste a
                  // l'air d'avoir fonctionné. C'est l'appelant qui ferme puis enchaîne, une
                  // fois ce Modal réellement parti.
                  onPress={() => onAction(a.key)}
                  style={{ height: ROW_H }}
                  className="flex-row items-center justify-between px-4 active:bg-gray-100 dark:active:bg-zinc-800"
                >
                  <Text
                    className={`text-base ${
                      a.destructive ? 'text-red-500' : 'text-gray-900 dark:text-zinc-100'
                    }`}
                  >
                    {a.label}
                  </Text>
                  <Ionicons
                    name={a.icon}
                    size={19}
                    color={a.destructive ? '#EF4444' : colors.muted}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      </Animated.View>

      <EmojiPicker
        visible={pickerOpen}
        onPick={(emoji) => {
          setPickerOpen(false);
          pick(emoji);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Modal>
  );
}

/** Fenêtre de modification de ses propres messages — doit rester alignée sur le serveur. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Construit la liste d'actions selon le message et les droits de l'utilisateur. */
export const buildActions = (
  t: (k: string) => string,
  opts: {
    hasText: boolean;
    pinned: boolean;
    starred: boolean;
    canDelete: boolean;
    /** Un éphémère ne se transfère pas : le sortir de sa conversation annulerait sa durée de vie. */
    ephemeral: boolean;
    /** Mien ET texte ET dans la fenêtre : les trois conditions de la modification. */
    canEdit: boolean;
    /** Les statuts détaillés n'ont de sens que sur ses propres envois. */
    isMine: boolean;
    /** Un message supprimé n'accepte plus que la sélection. */
    deleted: boolean;
  },
): ActionDef[] => {
  if (opts.deleted) {
    return [
      { key: 'select', label: t('chat.select'), icon: 'checkmark-circle-outline' },
      ...(opts.canDelete
        ? [
            {
              key: 'delete' as const,
              label: t('chat.delete'),
              icon: 'trash-outline' as const,
              destructive: true,
            },
          ]
        : []),
    ];
  }
  return [
    { key: 'reply', label: t('chat.reply'), icon: 'arrow-undo' },
    ...(opts.hasText
      ? [{ key: 'copy' as const, label: t('chat.copy'), icon: 'copy-outline' as const }]
      : []),
    ...(opts.ephemeral
      ? []
      : [{ key: 'forward' as const, label: t('chat.forward'), icon: 'arrow-redo' as const }]),
    ...(opts.canEdit
      ? [{ key: 'edit' as const, label: t('chat.edit'), icon: 'create-outline' as const }]
      : []),
    opts.pinned
      ? { key: 'unpin', label: t('details.unpin'), icon: 'pin-outline' }
      : { key: 'pin', label: t('details.pin'), icon: 'pin' },
    opts.starred
      ? { key: 'unstar', label: t('details.unstar'), icon: 'star-outline' }
      : { key: 'star', label: t('details.star'), icon: 'star' },
    ...(opts.isMine
      ? [{ key: 'info' as const, label: t('chat.message_info'), icon: 'information-circle-outline' as const }]
      : []),
    { key: 'select', label: t('chat.select'), icon: 'checkmark-circle-outline' },
    ...(opts.canDelete
      ? [
          {
            key: 'delete' as const,
            label: t('chat.delete'),
            icon: 'trash-outline' as const,
            destructive: true,
          },
        ]
      : []),
  ];
};
