import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { ROUND } from '../lib/radius';

/**
 * Extrait d'un message cité, tel que le serveur le renvoie dans `replyTo`.
 *
 * ⚠️ Volontairement PLAT : le serveur ne rouvre pas la citation de la citation. Un fil de
 * réponses imbriquées n'a nulle part où s'afficher dans une bulle, et le coût de lecture
 * grandirait à chaque niveau.
 */
export type Quote = {
  id: string;
  senderId: string;
  sender?: { id: string; name: string } | null;
  type?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  /** Le message cité était éphémère et a expiré : le serveur a vidé ce qu'il portait. */
  expired?: boolean;
};

/**
 * Aperçu d'un message cité en une ligne, sans son type d'origine.
 *
 * ⚠️ Le média ne compte pas dans le texte : une photo sans légende doit tout de même dire
 * « Photo », sinon la citation serait une barre colorée vide et on ne saurait pas à quoi la
 * réponse répond.
 */
export const quoteSummary = (
  q: Quote,
  t: (k: string, o?: any) => string,
): { icon: keyof typeof Ionicons.glyphMap | null; label: string } => {
  if (q.expired) return { icon: 'timer-outline', label: t('chat.quote_expired') };
  if (q.content) return { icon: null, label: q.content };
  switch (q.mediaType) {
    case 'image':
      return { icon: 'image', label: t('chat.quote_photo') };
    case 'video':
      return { icon: 'videocam', label: t('chat.quote_video') };
    case 'gif':
      return { icon: 'film', label: 'GIF' };
    case 'audio':
      return { icon: 'mic', label: t('chat.quote_audio') };
    case 'document':
      return { icon: 'document-text', label: q.fileName || t('chat.quote_document') };
    default:
      break;
  }
  if (q.type === 'location') return { icon: 'location', label: t('chat.quote_location') };
  return { icon: null, label: '' };
};

/**
 * Bloc de citation.
 *
 * Deux emplacements, un seul composant : dans la bulle (au-dessus du contenu) et au-dessus
 * du champ de saisie pendant la rédaction de la réponse. Les faire diverger, c'est se
 * retrouver avec deux aperçus qui ne résument pas le même message de la même façon.
 */
export function QuotedMessage({
  quote,
  currentUserId,
  /** Teinte de la barre latérale et du nom : la couleur d'accent de la bulle qui la porte. */
  accent,
  /** Bulle « moi » = fond coloré : tout ce qui s'y pose doit passer en clair. */
  onColored = false,
  onPress,
  onDismiss,
}: {
  quote: Quote;
  currentUserId: string;
  accent: string;
  onColored?: boolean;
  onPress?: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const { icon, label } = quoteSummary(quote, t);
  const mine = quote.senderId === currentUserId;
  const author = mine ? t('chat.quote_you') : quote.sender?.name || '';
  const thumb =
    quote.mediaUrl && (quote.mediaType === 'image' || quote.mediaType === 'gif')
      ? quote.mediaUrl
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={ROUND.inner}
      // ⚠️ Fond SEMI-TRANSPARENT et non une couleur fixe : ce bloc se pose aussi bien sur une
      // bulle blanche que sur un dégradé coloré, et une teinte en dur jurerait sur l'un des
      // deux. Le blanc translucide éclaircit dans les deux cas.
      className={`flex-row items-center overflow-hidden mb-1 ${
        onColored ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'
      }`}
    >
      {/* Barre latérale : le repère qui dit « ceci est une citation », comme WhatsApp. */}
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: onColored ? '#FFFFFF' : accent }} />
      <View className="flex-1 px-2.5 py-1.5">
        <Text
          numberOfLines={1}
          style={{ color: onColored ? '#FFFFFF' : accent }}
          className="text-sm font-semibold"
        >
          {author}
        </Text>
        <View className="flex-row items-center gap-1">
          {icon && (
            <Ionicons
              name={icon}
              size={12}
              color={onColored ? 'rgba(255,255,255,0.8)' : '#9CA3AF'}
            />
          )}
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm ${
              onColored ? 'text-white/80' : 'text-gray-500 dark:text-zinc-400'
            } ${quote.expired ? 'italic' : ''}`}
          >
            {label}
          </Text>
        </View>
      </View>
      {thumb && (
        <Image source={{ uri: thumb }} style={{ width: 40, height: 40 }} contentFit="cover" />
      )}
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          className="px-2.5 self-stretch items-center justify-center"
        >
          <Ionicons name="close" size={18} color="#9CA3AF" />
        </Pressable>
      )}
    </Pressable>
  );
}
