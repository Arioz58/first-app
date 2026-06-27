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
