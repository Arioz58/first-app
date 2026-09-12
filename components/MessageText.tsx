import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, type TextStyle } from 'react-native';

/**
 * Rendu du texte d'un message : formatage, liens, et repli des messages très longs.
 *
 * ⚠️ Les liens sont extraits AVANT le formatage. Une URL contient très souvent des
 * underscores et des tirets (`…/mon_article_2024`), qui seraient sinon lus comme des
 * marqueurs d'italique et couperaient le lien en morceaux — chacun devenant incliqua­ble.
 */

/** Marqueurs façon WhatsApp. L'ordre n'a pas d'importance, ils sont tous testés. */
const MARKS: { char: string; style: TextStyle }[] = [
  { char: '*', style: { fontWeight: '700' } },
  { char: '_', style: { fontStyle: 'italic' } },
  { char: '~', style: { textDecorationLine: 'line-through' } },
  { char: '`', style: { fontFamily: 'Courier', fontSize: 15 } },
];

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/** Nombre de lignes au-delà duquel un message est replié. */
const CLAMP_LINES = 8;

/**
 * Longueur au-delà de laquelle le texte est TRONQUÉ D'EMBLÉE, sans être mesuré.
 *
 * ⚠️ POURQUOI (bug diagnostiqué le 11/09, préexistant) : pour savoir s'il fallait un
 * « Voir plus », ce composant rendait d'abord le texte EN ENTIER, le mesurait, puis le
 * tronquait. Sur un message de 8 567 caractères — il y en a dans les conversations de test —
 * la bulle faisait environ 4 000 px le temps d'un rendu, avant de retomber à 160.
 *
 * Dans une liste virtualisée, ce n'est pas un détail d'affichage : en remontant l'historique,
 * ces cellules se montent, la taille du contenu enfle de plusieurs milliers de pixels puis
 * retombe, et la position du fil part avec. Mesuré : des variations de 8 000 px et un fil
 * ramené 1 000 px plus bas à chaque tentative de remonter — le défilement devenait
 * impossible dans les zones contenant de longs messages.
 *
 * ⚠️ 400 caractères et non 300 : la bulle la plus large tient une quarantaine de caractères
 * par ligne, donc huit lignes en font environ 320. En prenant un peu de marge, on ne tronque
 * d'emblée que des textes qui déborderont à coup sûr. Entre les deux, la mesure reste faite —
 * mais sur un texte assez court pour que l'écart de hauteur se compte en dizaines de pixels,
 * pas en milliers.
 */
const CLAMP_CHARS = 400;

/**
 * Ce texte débordera-t-il à coup sûr, sans avoir besoin de le rendre pour le savoir ?
 *
 * ⚠️ Les RETOURS À LA LIGNE comptent autant que la longueur : cent caractères répartis sur
 * vingt lignes débordent, alors qu'aucun seuil de longueur ne l'aurait vu.
 */
const certainlyOverflows = (text: string): boolean => {
  if (text.length > CLAMP_CHARS) return true;
  let breaks = 0;
  for (const c of text) if (c === '\n' && ++breaks >= CLAMP_LINES) return true;
  return false;
};

/**
 * Découpe un fragment selon les marqueurs de formatage.
 *
 * ⚠️ Le marqueur ne compte que s'il ENCADRE du texte et n'est pas collé à un caractère de
 * mot à l'extérieur : sans cette garde, `snake_case_name` deviendrait italique et
 * `3 * 4 * 5` gras. C'est la règle de WhatsApp, et elle évite l'essentiel des faux positifs.
 */
function parseMarks(text: string, key: string, inherited: TextStyle[]): React.ReactNode[] {
  for (const { char, style } of MARKS) {
    const esc = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Ouvrant non suivi d'un espace, fermant non précédé d'un espace, contenu non vide.
    const re = new RegExp(`${esc}(?![\\s${esc}])([^${esc}\\n]*[^\\s${esc}])${esc}`);
    const m = re.exec(text);
    if (!m || m.index === undefined) continue;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    return [
      ...(before ? parseMarks(before, `${key}b`, inherited) : []),
      <Text key={`${key}m`} style={[...inherited, style]}>
        {parseMarks(m[1], `${key}i`, [...inherited, style])}
      </Text>,
      ...(after ? parseMarks(after, `${key}a`, inherited) : []),
    ];
  }
  return [text];
}

/**
 * Découpe un fragment sur le terme recherché et surligne les occurrences.
 *
 * ⚠️ Recherche insensible à la casse ET sans expression régulière construite depuis la
 * saisie : un terme comme `a)` ou `[` casserait une regex compilée à la volée, et un terme
 * choisi exprès pourrait la faire boucler. On travaille donc sur des index de chaîne.
 */
function withHighlight(
  nodes: React.ReactNode[],
  term: string,
  key: string,
): React.ReactNode[] {
  if (!term) return nodes;
  const needle = term.toLowerCase();
  const out: React.ReactNode[] = [];
  nodes.forEach((node, n) => {
    if (typeof node !== 'string') {
      out.push(node);
      return;
    }
    const hay = node.toLowerCase();
    let from = 0;
    let i = 0;
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, from)) {
      if (at > from) out.push(node.slice(from, at));
      out.push(
        <Text key={`${key}h${n}-${i++}`} style={{ backgroundColor: 'rgba(250,204,21,0.55)' }}>
          {node.slice(at, at + term.length)}
        </Text>,
      );
      from = at + term.length;
    }
    out.push(from ? node.slice(from) : node);
  });
  return out;
}

export function MessageText({
  content,
  className,
  linkColor,
  /** Un aperçu (citation, bandeau épinglé) ne se replie pas : il est déjà tronqué. */
  collapsible = true,
  /** Terme de recherche à surligner dans le texte. */
  highlight,
}: {
  content: string;
  className?: string;
  linkColor: string;
  collapsible?: boolean;
  highlight?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  /**
   * Débordement CONSTATÉ à la mesure — pour les textes assez courts pour qu'on se permette
   * de les rendre en entier.
   *
   * ⚠️ La mesure reste nécessaire là où elle est sûre : une même chaîne occupe un nombre de
   * lignes différent selon la largeur de la bulle, la langue et la taille de police système.
   * On ne la remplace pas par une estimation, on lui retire seulement les cas où elle coûtait
   * une cellule de 4 000 px (voir `CLAMP_CHARS`).
   */
  const [measured, setMeasured] = useState(false);
  const overflows = measured || certainlyOverflows(content);

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of content.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(...parseMarks(content.slice(last, start), `t${i}`, []));
    const url = m[0];
    nodes.push(
      <Text
        key={`u${i}`}
        style={{ color: linkColor, textDecorationLine: 'underline' }}
        onPress={() => Linking.openURL(url.startsWith('www.') ? `https://${url}` : url).catch(() => {})}
      >
        {url}
      </Text>,
    );
    last = start + url.length;
    i++;
  }
  if (last < content.length) nodes.push(...parseMarks(content.slice(last), `t${i}`, []));

  const clamped = collapsible && overflows && !expanded;

  return (
    <>
      <Text
        className={className}
        numberOfLines={clamped ? CLAMP_LINES : undefined}
        /**
         * ⚠️ Mesure faite UNIQUEMENT sur les textes qu'on accepte de rendre en entier : au
         * delà de `CLAMP_CHARS`, `overflows` est déjà vrai, la bulle est tronquée dès le
         * premier rendu et il n'y a plus rien à mesurer.
         *
         * ⚠️ Ne se déclenche pas quand `numberOfLines` est posé : on mesure donc une seule
         * fois, tant qu'on ne sait pas encore s'il y a débordement.
         */
        onTextLayout={
          collapsible && !overflows
            ? (e) => {
                if (e.nativeEvent.lines.length > CLAMP_LINES) setMeasured(true);
              }
            : undefined
        }
      >
        {highlight ? withHighlight(nodes, highlight, 'hl') : nodes}
      </Text>
      {collapsible && overflows && (
        <Text
          onPress={() => setExpanded((v) => !v)}
          style={{ color: linkColor }}
          className="text-sm font-semibold mt-0.5"
        >
          {expanded ? t('chat.show_less') : t('chat.show_more')}
        </Text>
      )}
    </>
  );
}
