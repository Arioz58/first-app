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

export function MessageText({
  content,
  className,
  linkColor,
  /** Un aperçu (citation, bandeau épinglé) ne se replie pas : il est déjà tronqué. */
  collapsible = true,
}: {
  content: string;
  className?: string;
  linkColor: string;
  collapsible?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // ⚠️ Mesuré et non deviné à partir de la longueur : une même chaîne occupe un nombre de
  // lignes différent selon la largeur de la bulle, la langue et la taille de police système.
  const [overflows, setOverflows] = useState(false);

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
        // ⚠️ Ne se déclenche pas quand `numberOfLines` est posé : on mesure donc une seule
        // fois, tant qu'on ne sait pas encore s'il y a débordement.
        onTextLayout={
          collapsible && !overflows
            ? (e) => {
                if (e.nativeEvent.lines.length > CLAMP_LINES) setOverflows(true);
              }
            : undefined
        }
      >
        {nodes}
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
