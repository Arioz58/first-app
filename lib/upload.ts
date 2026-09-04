import * as ImageManipulator from 'expo-image-manipulator';

import { apiRequest } from './api';

// Upload générique vers S3 via URL presignée → renvoie l'URL publique CloudFront.
// `folder` route le fichier (ex. 'chat' pour les pièces jointes de conversation).
export const uploadFile = async (
  uri: string,
  contentType: string,
  folder: 'chat' | 'stories' = 'chat',
): Promise<string> => {
  const { uploadUrl, publicUrl } = await apiRequest<{ uploadUrl: string; publicUrl: string }>(
    '/upload/presigned-url',
    { method: 'POST', body: { contentType, folder } },
  );

  const blob = await fetch(uri).then((r) => r.blob());
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!up.ok) throw new Error('upload');

  return publicUrl;
};

// Catégorie média → libellé/format d'affichage.
export const formatFileSize = (bytes?: number | null): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

// Première URL détectée dans un texte (pour rendre les liens cliquables).
const URL_RE = /(https?:\/\/[^\s]+)/i;
export const firstUrl = (text?: string | null): string | null => {
  const m = (text ?? '').match(URL_RE);
  return m ? m[0] : null;
};

/**
 * Normalise une image AVANT téléversement : re-encodage en vrai JPEG.
 *
 * ⚠️ INDISPENSABLE à cause du HEIC. Une photo prise sur iPhone est en HEIC, et le chat la
 * téléversait telle quelle en la déclarant `image/jpeg` — un mensonge sur le contenu. iOS
 * décode le HEIC nativement, donc l'app mobile l'affichait ; AUCUN navigateur ne le décode,
 * donc le client web n'affichait qu'une image cassée. Constaté sur 8 images d'une base de
 * test : `Content-Type: image/jpeg` pour un fichier commençant par `ftypheic`.
 *
 * ⚠️ Les GIFs sont laissés INTACTS : les ré-encoder en JPEG les figerait sur leur première
 * image. C'est la seule exception, et elle doit le rester.
 *
 * ⚠️ Le re-encodage touche aussi les JPEG déjà valides. C'est assumé : détecter le format
 * demanderait de lire l'en-tête du fichier, et l'opération corrige au passage l'orientation
 * EXIF et allège les photos de plusieurs mégaoctets.
 */
export const toUploadableImage = async (
  uri: string,
  mimeType?: string | null,
): Promise<{ uri: string; contentType: string }> => {
  if (mimeType === 'image/gif' || /\.gif($|\?)/i.test(uri)) {
    return { uri, contentType: 'image/gif' };
  }
  try {
    const out = await ImageManipulator.manipulateAsync(uri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.9,
    });
    return { uri: out.uri, contentType: 'image/jpeg' };
  } catch {
    /**
     * ⚠️ Échec du re-encodage : on téléverse l'original plutôt que de perdre l'envoi. Le
     * média risque de ne pas s'afficher sur le web, ce qui reste préférable à un message
     * qui ne part pas du tout.
     */
    return { uri, contentType: mimeType || 'image/jpeg' };
  }
};
