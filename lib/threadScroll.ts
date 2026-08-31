import { useCallback, useEffect, useRef } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * POSITION DANS LE FIL DE DISCUSSION — machine à états.
 *
 * ⚠️ Pourquoi ce module existe. Le défilement du chat était piloté par neuf refs
 * indépendantes (`followUntilRef`, `atBottomRef`, `openTargetRef`, `pendingScrollRef`,
 * `revealedRef`…) lues et écrites depuis seize endroits — chaque handler de la liste, l'envoi,
 * la réception, l'ouverture, les sauts. Chacune avait été ajoutée pour éteindre un symptôme
 * précis et se justifiait isolément ; ensemble, elles ne formaient pas une machine mais une
 * pile où PERSONNE NE POSSÉDAIT le défilement à un instant donné.
 *
 * Le défaut qui l'a rendu évident : à l'ouverture sur le repère de reprise, le fil se calait
 * dessus puis redescendait aussitôt en bas. `onScroll` continuait d'entretenir « suis-je en
 * bas ? » PENDANT le calage ; les cellules se montant par lots, l'offset repassait sous le
 * seuil, le drapeau basculait, et le mode « suivre le bas » reprenait la main au changement
 * de taille suivant — annulant un calage qui venait d'aboutir.
 *
 * Ici, un seul état est actif à la fois et lui seul peut déplacer le fil :
 *
 *   opening   le fil se cale (sur le repère, ou en bas) et reste MASQUÉ. Les mesures ne
 *             peuvent rien armer : elles ne font que relancer le calage.
 *   anchored  une position est tenue. Rien ne déplace le fil — ni un message qui arrive, ni
 *             une image qui finit de charger, ni une page d'historique.
 *   following collé au bas : le fil suit ce qui arrive.
 *   jumping   trajet vers un message précis, puis on tient la position.
 *
 * Les transitions sont explicites et peu nombreuses. Un handler ne « décide » plus : il
 * DEMANDE, et l'état en cours accepte ou refuse.
 */
export type ThreadScrollMode = 'opening' | 'anchored' | 'following' | 'jumping';

/** Distance au bas (px) en deçà de laquelle on considère l'utilisateur « en bas ». */
const AT_BOTTOM_PX = 100;
/** Reprise d'un `scrollToIndex` qui a échoué faute de cellule montée. */
const RETRY_MS = 120;
const MAX_TRIES = 8;
/** Durée du défilement animé, avant la passe de calage finale. */
const SMOOTH_MS = 420;
/** Fondu de dévoilement du fil, une fois calé. */
const REVEAL_MS = 140;
/** Le fil doit apparaître même si les mesures s'enchaînent sans fin. */
const REVEAL_CAP_MS = 1400;
/** Délai après la dernière mesure avant de considérer le calage terminé. */
const REVEAL_SETTLE_MS = 160;

type Target = {
  key: string;
  viewPosition: number;
  viewOffset: number;
  animated: boolean;
  tries: number;
};

export function useThreadScroll({
  listRef,
  /**
   * Lignes dans l'ordre d'AFFICHAGE (liste inversée). Une ref, pas une valeur : les reprises
   * différées doivent lire l'état au moment où elles s'exécutent, pas celui qu'elles ont
   * capturé — un fil remplacé entre-temps donnerait un index hors bornes.
   */
  rowsRef,
  /** Décalage du repère sous l'en-tête flottant (voir `focusRow`). */
  anchorOffset,
  /**
   * Le bas du contenu CHARGÉ est-il le bas de la conversation ?
   *
   * Faux après un saut au milieu de l'historique : s'y coller ramènerait l'utilisateur au
   * bout de chaque page fraîchement chargée, contre son défilement.
   */
  bottomIsLive,
}: {
  listRef: React.RefObject<FlatList<any> | null>;
  rowsRef: React.RefObject<{ key: string }[]>;
  anchorOffset: number;
  bottomIsLive: () => boolean;
}) {
  // ⚠️ L'état vit dans une ref, pas dans un `useState` : il est lu et écrit depuis
  // `onContentSizeChange`, qui se déclenche plusieurs fois pendant que les cellules se
  // montent. Un état provoquerait un rendu de la liste en plein calage.
  const modeRef = useRef<ThreadScrollMode>('opening');
  const targetRef = useRef<Target | null>(null);
  const draggingRef = useRef(false);
  /** Dernière distance au bas mesurée. Une OBSERVATION, jamais une décision. */
  const distanceRef = useRef(0);
  const smoothingRef = useRef(false);

  // --- Dévoilement ---
  const reveal = useSharedValue(0);
  const revealedRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));

  const finishOpening = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    /**
     * ⚠️ L'état de SORTIE dépend de ce qu'on visait, et c'est tout le correctif.
     *
     * On visait une ligne → `anchored` : le fil TIENT sa position, définitivement. C'est ce
     * qui manquait — l'ancienne version effaçait simplement la cible, et le mode « suivre le
     * bas » redevenait éligible dès la mesure suivante.
     * On visait le bas → `following`.
     */
    modeRef.current = targetRef.current ? 'anchored' : 'following';
    targetRef.current = null;
    reveal.value = withTiming(1, { duration: REVEAL_MS });
  }, [reveal]);

  /** Le calage semble terminé : on dévoile, sauf si une reprise est encore en vol. */
  const scheduleReveal = useCallback(() => {
    if (revealedRef.current) return;
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      if (targetRef.current && targetRef.current.tries > 0) {
        scheduleReveal(); // une reprise court encore : la montrer serait montrer le saut
        return;
      }
      finishOpening();
    }, REVEAL_SETTLE_MS);
  }, [finishOpening]);

  // --- Primitives de déplacement ---

  /** Bas du fil. ⚠️ Liste INVERSÉE : le message le plus récent est à l'offset ZÉRO. */
  const toBottom = useCallback(
    (animated: boolean) => {
      if (draggingRef.current || smoothingRef.current) return;
      listRef.current?.scrollToOffset({ offset: 0, animated });
      if (!animated) {
        // Le contenu grandit encore (cellules montées par lots, média qui charge) : on
        // repasse, en re-testant à chaque fois que personne n'a repris la main.
        const settle = () => {
          if (draggingRef.current || modeRef.current !== 'following') return;
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        };
        requestAnimationFrame(settle);
        setTimeout(settle, RETRY_MS);
        return;
      }
      // Animé : on laisse le mouvement se dérouler, puis UNE passe finale, animée elle aussi.
      // ⚠️ Sans condition de distance : la mesure disponible date d'avant que la nouvelle
      // bulle soit mesurée, et vaut ~0 alors qu'il reste sa hauteur à parcourir. S'y fier
      // laissait le message envoyé sous la zone de saisie.
      smoothingRef.current = true;
      setTimeout(() => {
        smoothingRef.current = false;
        if (draggingRef.current || modeRef.current !== 'following') return;
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, SMOOTH_MS);
    },
    [listRef],
  );

  /**
   * Vise une ligne précise et RETIENT la cible, pour pouvoir retenter.
   *
   * ⚠️ Sans `getItemLayout` — impossible ici, les hauteurs de bulles sont variables —
   * `scrollToIndex` échoue tant que la cellule visée n'est pas montée. Depuis l'inversion,
   * l'indice 0 est le message le plus RÉCENT : un repère ou un épinglé un peu ancien se
   * trouve loin dans la liste, donc non monté, et l'appel échouerait silencieusement.
   */
  const focusRow = useCallback(
    (key: string, viewPosition: number, viewOffset: number, animated: boolean) => {
      const index = rowsRef.current?.findIndex((r) => r.key === key) ?? -1;
      if (index < 0) return false;
      targetRef.current = { key, viewPosition, viewOffset, animated, tries: 0 };
      listRef.current?.scrollToIndex({ index, animated, viewPosition, viewOffset });
      return true;
    },
    [listRef, rowsRef],
  );

  // ⚠️ Plafond armé dès le MONTAGE, et pas seulement à l'ouverture : si `open` n'est jamais
  // appelé — chargement en échec, effet qui ne se déclenche pas — le fil resterait masqué
  // indéfiniment. Un écran vide est le pire des états.
  useEffect(() => {
    capTimerRef.current = setTimeout(finishOpening, REVEAL_CAP_MS);
    return () => {
      if (capTimerRef.current) clearTimeout(capTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [finishOpening]);

  // --- Transitions ---

  /**
   * Ouverture du fil. `key` = ligne du repère de reprise, `null` = ouvrir en bas.
   * Le fil reste masqué jusqu'à ce que la position soit juste.
   */
  const open = useCallback(
    (key: string | null) => {
      modeRef.current = 'opening';
      revealedRef.current = false;
      reveal.value = 0;
      targetRef.current = key
        ? // ⚠️ `viewPosition: 1` : la liste étant inversée, la FIN de la fenêtre visible
          // correspond au HAUT de l'écran — c'est là qu'on veut le repère, pour lire vers
          // le bas à partir de lui.
          //
          // ⚠️ Décalage NÉGATIF, contre l'intuition : React Native calcule
          // `offset = position - viewOffset`, donc un décalage positif remonterait la ligne
          // sous la carte d'en-tête flottante. Le signe opposé l'en dégage.
          { key, viewPosition: 1, viewOffset: -anchorOffset, animated: false, tries: 0 }
        : null;
      if (capTimerRef.current) clearTimeout(capTimerRef.current);
      // Plafond dur : un écran resté vide serait bien pire que le saut qu'on corrige.
      capTimerRef.current = setTimeout(finishOpening, REVEAL_CAP_MS);
      /**
       * ⚠️ Le calage est lancé ICI, et pas seulement depuis `onContentSizeChange`.
       *
       * `open` est appelé depuis un effet, donc APRÈS le rendu — et donc après le changement
       * de taille du contenu qui suivait le chargement de l'historique, qui trouvait encore
       * la cible vide. Avant l'inversion, le contenu grandissait longtemps (cellules montées
       * par lots) et une mesure ultérieure rattrapait le coup ; inversée, la liste se
       * stabilise tout de suite et la fenêtre était simplement ratée.
       */
      const t = targetRef.current;
      if (t) focusRow(t.key, t.viewPosition, t.viewOffset, false);
      else toBottom(false);
      scheduleReveal();
    },
    [anchorOffset, finishOpening, focusRow, reveal, scheduleReveal, toBottom],
  );

  /** Le fil est vide ou déjà en place : rien à caler. */
  const revealNow = useCallback(() => {
    targetRef.current = null;
    finishOpening();
  }, [finishOpening]);

  /** Saut vers un message (épinglé, favori, citation, résultat de recherche). */
  const jumpTo = useCallback(
    (key: string) => {
      modeRef.current = 'jumping';
      if (!focusRow(key, 0.5, 0, true)) modeRef.current = 'anchored';
    },
    [focusRow],
  );

  /**
   * On veut suivre le bas : envoi d'un message, ou appui sur « revenir en bas ».
   *
   * ⚠️ Seule transition qui force `following` sans geste de défilement — c'est une INTENTION
   * de l'utilisateur, pas une mesure. C'est ce qui remplace l'ancienne « fenêtre de suivi »
   * de 2,5 s, qui laissait n'importe quelle mesure arrivée dans cet intervalle déplacer le
   * fil, y compris pendant un calage sur le repère.
   */
  const follow = useCallback(
    (animated = false) => {
      modeRef.current = 'following';
      targetRef.current = null;
      toBottom(animated);
    },
    [toBottom],
  );

  /** L'utilisateur est-il au bas du fil ? Observation, pour l'affichage seulement. */
  const isAtBottom = useCallback(
    () => distanceRef.current < AT_BOTTOM_PX && bottomIsLive(),
    [bottomIsLive],
  );

  const mode = useCallback(() => modeRef.current, []);

  // --- Handlers de la liste ---

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // ⚠️ Liste inversée : la distance au bas EST l'offset.
      distanceRef.current = e.nativeEvent.contentOffset.y;
      // ⚠️ Pendant `opening` et `jumping`, le défilement est le NÔTRE : le lire pour en
      // déduire une intention reviendrait à réagir à notre propre mouvement. C'est
      // exactement ce qui annulait l'ouverture sur le repère.
      if (modeRef.current === 'opening' || modeRef.current === 'jumping') return;
      // Seul un fil réellement au bas passe en suivi ; s'en éloigner l'arrête.
      if (distanceRef.current < AT_BOTTOM_PX && bottomIsLive()) {
        modeRef.current = 'following';
      } else if (modeRef.current === 'following') {
        modeRef.current = 'anchored';
      }
    },
    [bottomIsLive],
  );

  const onContentSizeChange = useCallback(() => {
    const t = targetRef.current;
    if (modeRef.current === 'opening') {
      // Rejoué à chaque mesure tant que le fil n'est pas dévoilé : la position juste n'est
      // connue qu'une fois les cellules du dessus mesurées.
      if (t) focusRow(t.key, t.viewPosition, t.viewOffset, false);
      else toBottom(false);
      scheduleReveal();
      return;
    }
    if (modeRef.current === 'following') toBottom(false);
    // `anchored` / `jumping` : on ne touche à rien. Le fil grandit, la position tient.
  }, [focusRow, scheduleReveal, toBottom]);

  const onLayout = useCallback(() => {
    if (modeRef.current === 'opening' && !targetRef.current) toBottom(false);
  }, [toBottom]);

  const onScrollBeginDrag = useCallback(() => {
    draggingRef.current = true;
    // Le doigt prime sur tout : un calage encore en cours ne doit pas repasser devant.
    targetRef.current = null;
    if (modeRef.current === 'jumping') modeRef.current = 'anchored';
  }, []);

  const onScrollEndDrag = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    draggingRef.current = false;
    // Le trajet d'un saut est terminé : on tient désormais la position atteinte.
    if (modeRef.current === 'jumping') modeRef.current = 'anchored';
  }, []);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // On s'approche à l'estimation : ça force le rendu des cellules manquantes.
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      const t = targetRef.current;
      if (!t || t.tries >= MAX_TRIES) {
        targetRef.current = null;
        if (modeRef.current === 'jumping') modeRef.current = 'anchored';
        return;
      }
      t.tries += 1;
      // ⚠️ Un délai, PAS `requestAnimationFrame` : VirtualizedList monte ses cellules par
      // lots espacés d'`updateCellsBatchingPeriod` (50 ms). Repasser à l'image suivante
      // (~16 ms) retombe sur exactement le même nombre de cellules mesurées, et la reprise
      // tourne à vide.
      setTimeout(() => {
        const cur = targetRef.current;
        if (!cur) return;
        // ⚠️ On relit les lignes ACTUELLES : entre l'échec et cette reprise, le fil a pu
        // être remplacé, et un index calculé sur l'ancienne liste ferait planter la liste
        // (« scrollToIndex out of range »).
        const rows = rowsRef.current ?? [];
        const index = rows.findIndex((r) => r.key === cur.key);
        if (index < 0 || index >= rows.length) {
          targetRef.current = null;
          if (modeRef.current === 'jumping') modeRef.current = 'anchored';
          return;
        }
        listRef.current?.scrollToIndex({
          index,
          animated: cur.animated,
          viewPosition: cur.viewPosition,
          viewOffset: cur.viewOffset,
        });
      }, RETRY_MS);
    },
    [listRef, rowsRef],
  );

  return {
    revealStyle,
    mode,
    isAtBottom,
    // transitions
    open,
    revealNow,
    jumpTo,
    follow,
    // handlers à poser sur la liste
    onScroll,
    onContentSizeChange,
    onLayout,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollEnd,
    onScrollToIndexFailed,
  };
}
