import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// Formats que WKWebView rend nativement. Le reste — bureautique surtout — n'est pas
// garanti : l'icône de la carte annonce alors un téléchargement, et la visionneuse bascule
// d'elle-même sur son écran de repli si le rendu échoue.
const VIEWABLE_EXT = ['pdf', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'];

/** Extension déduite du nom d'origine, à défaut de l'URL. */
export const fileExtension = (fileName?: string | null, url?: string | null): string => {
  const source = fileName || url?.split('?')[0] || '';
  const ext = source.split('.').pop()?.toLowerCase() ?? '';
  return ext.length <= 5 ? ext : '';
};

export const isViewableDocument = (fileName?: string | null, url?: string | null): boolean =>
  VIEWABLE_EXT.includes(fileExtension(fileName, url));

/** Copie le fichier dans le stockage de l'app. Renvoie le chemin local, ou null en échec. */
export const downloadDocument = async (
  url: string,
  fileName?: string | null,
): Promise<string | null> => {
  try {
    const name = fileName || url.split('/').pop() || `document_${Date.now()}`;
    const target = `${FileSystem.documentDirectory}${name}`;
    const { uri } = await FileSystem.downloadAsync(url, target);
    return uri;
  } catch {
    return null;
  }
};

// Type MIME déduit de l'extension : Android en a besoin pour proposer les bonnes apps
// dans la feuille de partage (sans lui, la liste est vide ou générique).
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * Récupère le document et laisse l'utilisateur choisir où il atterrit (Fichiers, Drive,
 * Mail, AirDrop…) via la feuille de partage système. Identique sur iOS et Android :
 * `expo-sharing` passe par un `content://` (FileProvider) côté Android, ce que le `Share`
 * de React Native ne sait pas faire.
 *
 * Le téléchargement seul ne suffirait pas : `documentDirectory` est le bac à sable de
 * l'application, invisible depuis l'app Fichiers. Un fichier « téléchargé » y serait
 * introuvable pour l'utilisateur. On passe donc par le cache — le fichier n'a plus à
 * survivre une fois remis au système — puis par la feuille de partage.
 */
export const saveDocument = async (
  url: string,
  fileName?: string | null,
): Promise<'shared' | 'saved' | null> => {
  // Un « / » dans le nom d'origine casserait le chemin de destination.
  const name = (fileName || url.split('/').pop() || `document_${Date.now()}`).replace(
    /[/\\]/g,
    '_',
  );
  try {
    const { uri } = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${name}`);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: MIME_BY_EXT[fileExtension(name)] ?? 'application/octet-stream',
        dialogTitle: name,
      });
      return 'shared';
    }
    // Pas de feuille de partage disponible : au moins garder une copie interne.
    const saved = await downloadDocument(url, name);
    return saved ? 'saved' : null;
  } catch {
    return null;
  }
};
