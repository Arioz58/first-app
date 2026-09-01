import { Image } from 'expo-image';
import { Linking, Pressable, Text, View } from 'react-native';
import { MEDIA_FADE_MS, MEDIA_PLACEHOLDER } from '../lib/mediaAppearance';
import { ROUND } from '../lib/radius';

export type LinkPreview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};

/** Domaine seul, sans `www.` — c'est le repère qui dit où mène le lien. */
const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Carte d'aperçu d'un lien, posée dans la bulle au-dessus du texte.
 *
 * ⚠️ Le domaine est TOUJOURS affiché, et en premier. Un titre et une image viennent du site
 * lui-même : ils peuvent annoncer n'importe quoi. Le domaine est la seule information que le
 * destinataire peut vraiment recouper avant d'appuyer, et c'est ce qui rend un lien
 * trompeur plus difficile à faire passer.
 */
export function LinkPreviewCard({
  preview,
  onColored,
}: {
  preview: LinkPreview;
  /** Posée sur une bulle « moi », colorée : tout ce qui s'y pose passe en clair. */
  onColored: boolean;
}) {
  return (
    <Pressable
      onPress={() => Linking.openURL(preview.url).catch(() => {})}
      style={ROUND.inner}
      // Fond translucide plutôt qu'une couleur fixe : la carte se pose aussi bien sur une
      // bulle blanche que sur un dégradé coloré.
      className={`overflow-hidden mb-1 ${onColored ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}
    >
      {preview.image && (
        <Image
          source={{ uri: preview.image }}
          style={{ width: '100%', height: 140, backgroundColor: MEDIA_PLACEHOLDER }}
          contentFit="cover"
          transition={MEDIA_FADE_MS}
        />
      )}
      <View className="px-2.5 py-2">
        <Text
          numberOfLines={1}
          className={`text-xs font-medium ${
            onColored ? 'text-white/75' : 'text-gray-500 dark:text-zinc-400'
          }`}
        >
          {preview.siteName || domainOf(preview.url)}
        </Text>
        {!!preview.title && (
          <Text
            numberOfLines={2}
            className={`text-sm font-semibold mt-0.5 ${
              onColored ? 'text-white' : 'text-gray-900 dark:text-zinc-100'
            }`}
          >
            {preview.title}
          </Text>
        )}
        {!!preview.description && (
          <Text
            numberOfLines={2}
            className={`text-xs mt-0.5 ${
              onColored ? 'text-white/70' : 'text-gray-500 dark:text-zinc-400'
            }`}
          >
            {preview.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
