import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AnimatePresence, MotiView } from 'moti';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS } from '../lib/radius';
import {
  dismissToast,
  pauseToastExpiry,
  resumeToastExpiry,
  useToasts,
  type Toast,
} from '../lib/toasts';
import { useThemeColors } from '../lib/theme';
import { FLOATING_SHADOW, GlassSurface } from './GlassSurface';
import { UserAvatar } from './UserAvatar';

/** Bandeaux visibles quand la pile est FERMÉE. Au-delà, elle se lit comme un tas de papiers. */
const VISIBLE = 3;

/**
 * Hauteur d'un bandeau, FIXE.
 *
 * ⚠️ Imposée et non mesurée : déplier la pile demande de savoir où poser chaque carte, et une
 * hauteur mesurée arriverait une image trop tard — la liste se déplierait en deux temps. C'est
 * aussi ce qui permet au corps de tenir sur UNE ligne, comme une bannière du système : la liste
 * dépliée est un index, pas une lecture.
 */
const CARD_H = 64;

/** Écart entre deux bandeaux une fois la pile dépliée. */
const GAP = 8;

/**
 * Lisière laissée à chaque carte du dessous, pile fermée.
 *
 * ⚠️ Combinée au rétrécissement, c'est ELLE qui fait lire une pile plutôt qu'un décalage : on
 * doit voir dépasser le bord inférieur de la carte suivante, et ses côtés rentrer.
 */
const STACK_OFFSET = 11;

/** Rétrécissement par niveau de profondeur, pile fermée. */
const SCALE_STEP = 0.05;

/** Opacité par profondeur, pile fermée. La troisième ne dit que « il y en a d'autres ». */
const DEPTH_OPACITY = [1, 0.65, 0.35];

/**
 * Distance d'entrée et de sortie, vers le HAUT.
 *
 * ⚠️ Le bandeau vient du bord de l'écran, là où arrivent les notifications du système : c'est
 * ce qui le fait lire comme une alerte et non comme un élément de l'interface. Principe tenu
 * partout dans l'app — une chose vient de là où elle est déclenchée.
 */
const TRAVEL = 70;

/** Glissement vers le haut au-delà duquel le bandeau est rejeté. */
const DISMISS_DISTANCE = 44;
const DISMISS_VELOCITY = -700;

/**
 * Repli automatique de la pile ouverte.
 *
 * ⚠️ Indispensable puisque l'ouverture SUSPEND l'expiration : sans lui, une pile dépliée puis
 * oubliée resterait à l'écran indéfiniment.
 */
const COLLAPSE_AFTER = 8000;

/**
 * Déplacements — une COURBE, plus un ressort.
 *
 * ⚠️ TROIS CORRECTIONS SUCCESSIVES le même jour, chacune sur un défaut différent, et c'est la
 * dernière qui a réglé le fond du problème :
 *
 * 1. arrivée « trop lente » (ressort 200/22) : la cause n'était pas le réglage mais ce qu'on
 *    en voit — un ressort approche sa cible sans jamais tout à fait l'atteindre, et à la
 *    sortie le fondu efface la carte bien avant cette longue fin ;
 * 2. « trop de rebond » (420/32, ζ ≈ 0.78) : la carte dépassait sa place puis revenait. Passé
 *    à 500/45, soit ζ ≈ 1.006, amortissement critique — plus aucune oscillation ;
 * 3. « le dépliement rebondit encore ». Il n'oscillait pourtant plus : c'est la QUEUE du
 *    ressort qu'on voyait. Un ressort critique s'approche de sa cible de façon asymptotique,
 *    donc sans jamais s'arrêter franchement. Sur les 70 px d'une arrivée, cette fin est trop
 *    courte pour se remarquer ; au dépliement, la dernière carte parcourt plus de 200 px, et
 *    la même traîne se lit comme de l'élasticité.
 *
 * ⚠️ D'où une COURBE et non un ressort : `Easing.out(Easing.cubic)` décélère franchement et
 * s'arrête À LA DATE PRÉVUE. C'est la seule famille qui garantisse une fin nette quelle que
 * soit la distance — un ressort, lui, met d'autant plus de temps que le trajet est long.
 *
 * ⚠️ Ne PAS « rétablir un ressort » ici en se réclamant du vocabulaire commun
 * (`lib/motion.ts` côté web) : il est fait pour des objets qu'on manipule, où le dépassement
 * se lit comme de la matière. Une alerte se pose, elle ne rebondit pas.
 */
const TRANSITION = {
  translateY: { type: 'timing', duration: 240, easing: Easing.out(Easing.cubic) },
  scale: { type: 'timing', duration: 180, easing: Easing.out(Easing.cubic) },
  opacity: { type: 'timing', duration: 140 },
} as const;

function ToastCard({
  toast,
  depth,
  expanded,
  canExpand,
  onToggle,
}: {
  toast: Toast;
  depth: number;
  expanded: boolean;
  /** Vrai sur la carte du dessus quand la pile en cache d'autres : elle porte le chevron. */
  canExpand: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const colors = useThemeColors();

  /**
   * Glissement au doigt.
   *
   * ⚠️ Sur une vue INTERNE, distincte de celle que pilote Moti : les deux écriraient sinon le
   * même `transform`, et le dernier rendu effacerait la position du doigt à chaque image.
   */
  const drag = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));

  const open = () => {
    dismissToast(toast.id);
    toast.onOpen?.();
    if (toast.href) router.push(toast.href as never);
  };

  /**
   * ⚠️ TAP ET PAN TOUS DEUX EN RNGH, composés en `Race`. Un `Pressable` sous un
   * `GestureDetector` ne se déclencherait plus : le système de responder JS de React Native et
   * les gestes natifs ne s'arbitrent pas entre eux, et le natif gagne (même famille de conflit
   * que l'appui long des bulles, cf. `lib/bubbleGesture.ts`).
   */
  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success) runOnJS(open)();
  });

  /**
   * Chevron : il déplie la pile au lieu d'ouvrir la conversation.
   *
   * ⚠️ `blocksExternalGesture(tap)` est ce qui le fait gagner sur le tap de la carte, qui
   * l'englobe. Sans cette déclaration, l'arbitrage dépendrait de l'ordre de montage — et le
   * parent, déclaré plus haut, l'emporterait : toucher le chevron ouvrirait la conversation.
   */
  const chevronTap = Gesture.Tap()
    .blocksExternalGesture(tap)
    .onEnd((_e, success) => {
      if (success) runOnJS(onToggle)();
    });

  const pan = Gesture.Pan()
    // Vers le HAUT seulement : un bandeau ne se range pas vers le bas, où il n'y a rien.
    .activeOffsetY(-8)
    // Sans ce seuil, un défilement horizontal sous le bandeau l'emporterait avec lui.
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      // Vers le bas, le mouvement est fortement amorti : on sent que ça résiste plutôt que de
      // laisser décoller un bandeau qui n'ira nulle part.
      drag.value = e.translationY < 0 ? e.translationY : e.translationY * 0.15;
    })
    .onFinalize((e) => {
      // ⚠️ `onFinalize` et pas `onEnd` : un geste ANNULÉ (la navigation prend la main, un
      // second doigt) ne passe jamais par `onEnd`, et la carte resterait sous le doigt.
      if (e.translationY < -DISMISS_DISTANCE || e.velocityY < DISMISS_VELOCITY) {
        drag.value = withTiming(-TRAVEL, { duration: 140 });
        runOnJS(dismissToast)(toast.id);
        return;
      }
      drag.value = withTiming(0, { duration: 180 });
    });

  // Dépliée, la pile devient une LISTE : chaque carte à sa place, pleine et cliquable.
  // Fermée, elle redevient un empilement : les cartes du dessous reculent et s'effacent.
  const hidden = !expanded && depth >= VISIBLE;
  const translateY = expanded ? depth * (CARD_H + GAP) : depth * STACK_OFFSET;

  return (
    <MotiView
      from={{ translateY: -TRAVEL, opacity: 0, scale: 0.94 }}
      animate={{
        translateY,
        opacity: expanded ? 1 : hidden ? 0 : DEPTH_OPACITY[depth] ?? 0,
        scale: expanded ? 1 : 1 - depth * SCALE_STEP,
      }}
      exit={{ translateY: -TRAVEL, opacity: 0, scale: 0.94 }}
      transition={TRANSITION}
      // La carte de devant passe AU-DESSUS de celles qu'elle repousse.
      style={{ position: 'absolute', left: 0, right: 0, zIndex: VISIBLE - depth }}
      // Pile fermée, seule celle du dessus est touchable : les autres ne sont que des indices
      // visuels, et viser une carte à moitié cachée n'aurait pas de sens.
      pointerEvents={expanded ? 'auto' : depth === 0 ? 'auto' : 'none'}
    >
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        {/* ⚠️ L'ombre est portée par cette vue-ci, PAS par la surface en verre : sur iOS une
            même vue ne peut pas à la fois projeter une ombre et rogner ses enfants
            (`overflow: 'hidden'`), et l'ombre disparaîtrait sans un mot. */}
        <Animated.View style={[dragStyle, FLOATING_SHADOW]}>
          <GlassSurface radius={RADIUS.surface} intensity={80} tintOpacity={0.82}>
            <View className="flex-row items-center gap-3 px-3.5" style={{ height: CARD_H }}>
              <UserAvatar
                photoUrl={toast.photoUrl}
                name={toast.title}
                size={40}
                group={toast.isGroup}
              />
              <View className="flex-1">
                <Text
                  numberOfLines={1}
                  className="text-[15px] font-semibold text-gray-900 dark:text-gray-50"
                >
                  {toast.title}
                </Text>
                {/* Une seule ligne : la hauteur de la carte est fixe, et c'est elle qui permet
                    de déplier la pile sans mesurer quoi que ce soit. */}
                <Text numberOfLines={1} className="text-[13px] text-gray-600 dark:text-gray-300">
                  {toast.body}
                </Text>
              </View>
              {canExpand && (
                <GestureDetector gesture={chevronTap}>
                  {/* Zone de touche élargie : un chevron de 18 px se rate une fois sur deux. */}
                  <View className="-mr-1 h-11 w-9 items-center justify-center">
                    <MotiView
                      animate={{ rotate: expanded ? '180deg' : '0deg' }}
                      transition={{ type: 'timing', duration: 180 }}
                    >
                      <Ionicons name="chevron-down" size={18} color={colors.muted} />
                    </MotiView>
                  </View>
                </GestureDetector>
              )}
            </View>
          </GlassSurface>
        </Animated.View>
      </GestureDetector>
    </MotiView>
  );
}

/**
 * Pile de bandeaux d'alerte, en haut de l'écran.
 *
 * ⚠️ Montée au niveau de l'APPLICATION (`app/_layout.tsx`), hors du `Stack` : elle doit
 * survivre aux changements d'écran, puisque son rôle est précisément de prévenir de ce qui
 * arrive ailleurs que là où on se trouve.
 *
 * ⚠️ Elle ne couvre PAS les feuilles (`BottomSheet`, sélecteurs) : celles-ci vivent dans un
 * `Modal`, donc dans une fenêtre native posée au-dessus de tout l'arbre. Un bandeau reçu
 * pendant qu'un drawer est ouvert attendra sa fermeture — limite assumée, la même que celle du
 * rappel de lecture vocale.
 */
export function ToastStack() {
  const insets = useSafeAreaInsets();
  const toasts = useToasts();
  const [expanded, setExpanded] = useState(false);

  /**
   * La pile s'est vidée : elle ne peut pas rester « dépliée » pour la série suivante, qui n'a
   * rien à voir avec celle qu'on lisait.
   *
   * ⚠️ Ajusté PENDANT LE RENDU et non dans un effet. Un effet qui appelle `setState` déclenche
   * un deuxième rendu en cascade — la pile se dessinerait une image ouverte avant de se
   * refermer. C'est le motif que React recommande pour réinitialiser un état sur changement
   * d'une valeur d'entrée.
   *
   * ⚠️ Le drapeau doit être RÉINITIALISÉ et pas seulement ignoré au rendu : laissé à vrai, il
   * ferait s'ouvrir toute seule la prochaine pile dès sa deuxième alerte.
   */
  const [lastCount, setLastCount] = useState(toasts.length);
  if (lastCount !== toasts.length) {
    setLastCount(toasts.length);
    if (toasts.length <= 1 && expanded) setExpanded(false);
  }
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * ⚠️ Ouvrir la pile SUSPEND l'expiration des alertes : sans cela, elles s'effaceraient une à
   * une pendant qu'on lit la liste, et la ligne visée se déroberait sous le doigt.
   *
   * ⚠️ Repli automatique au bout de `COLLAPSE_AFTER` : l'expiration étant suspendue, une pile
   * dépliée puis oubliée resterait à l'écran indéfiniment.
   */
  useEffect(() => {
    if (!expanded) return;
    pauseToastExpiry();
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_AFTER);
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
      resumeToastExpiry();
    };
  }, [expanded]);

  return (
    <View
      // ⚠️ `box-none` : le conteneur occupe toute la largeur en haut de l'écran, et sans cela
      // il intercepterait les appuis destinés à l'en-tête qu'il recouvre.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 6,
        left: 12,
        right: 12,
        // Au-dessus du reste de l'application, rappel de lecture vocale compris.
        zIndex: 100,
      }}
    >
      <AnimatePresence>
        {toasts.map((toast, depth) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            depth={depth}
            expanded={expanded}
            canExpand={depth === 0 && toasts.length > 1}
            onToggle={() => setExpanded((v) => !v)}
          />
        ))}
      </AnimatePresence>
    </View>
  );
}
