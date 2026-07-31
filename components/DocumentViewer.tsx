import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { saveDocument } from '../lib/documents';
import { formatFileSize } from '../lib/upload';

const NEXA = '#1E40AF';

/**
 * Visionneuse de document plein écran, rendue dans l'app.
 *
 * ⚠️ Le rendu est confié à WKWebView, qui affiche nativement PDF, texte et images. Les
 * formats bureautiques ne sont pas garantis : en cas d'échec, on bascule sur un écran de
 * repli proposant le téléchargement. On ne passe VOLONTAIREMENT par aucun service de
 * conversion tiers (type Google Docs Viewer) : cela reviendrait à transmettre l'URL de
 * documents privés à un tiers qui les téléchargerait pour les afficher.
 */
export function DocumentViewer({
  url,
  fileName,
  fileSize,
  onClose,
}: {
  url: string;
  fileName?: string | null;
  fileSize?: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // ⚠️ Pas de <SafeAreaView> ici : dans un <Modal> natif, il mesure une fenêtre distincte
  // et renvoie souvent des marges nulles — l'en-tête passait alors sous la barre d'état,
  // rendant la croix de fermeture inatteignable. On applique les marges nous-mêmes, avec
  // un plancher qui tient même si le contexte ne remonte rien.
  const padTop = Math.max(insets.top, 44);
  const padBottom = Math.max(insets.bottom, 12);

  // La feuille de partage se charge du retour visuel : on n'ajoute une alerte que sur
  // échec, ou sur les plateformes où le fichier finit dans le stockage de l'app.
  const save = async () => {
    setBusy(true);
    const result = await saveDocument(url, fileName);
    setBusy(false);
    if (!result) Alert.alert('', t('media.upload_error'));
    else if (result === 'saved') Alert.alert('', t('media.downloaded', { count: 1 }));
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <View
        className="flex-1 bg-white dark:bg-zinc-950"
        style={{ paddingTop: padTop, paddingBottom: padBottom }}
      >
        <View className="flex-row items-center px-3 py-2 border-b border-gray-100 dark:border-zinc-800">
          <TouchableOpacity onPress={onClose} hitSlop={8} className="px-1">
            <Ionicons name="close" size={26} color={NEXA} />
          </TouchableOpacity>
          <View className="flex-1 ml-2">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-gray-900 dark:text-zinc-100"
            >
              {fileName || 'Document'}
            </Text>
            {fileSize ? (
              <Text className="text-xs text-gray-400 dark:text-zinc-500">
                {formatFileSize(fileSize)}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={save} hitSlop={8} className="px-2" disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color={NEXA} />
            ) : (
              <Ionicons name="download-outline" size={24} color={NEXA} />
            )}
          </TouchableOpacity>
        </View>

        {failed ? (
          <View className="flex-1 items-center justify-center px-10">
            <Ionicons name="document-text-outline" size={54} color="#9CA3AF" />
            <Text className="text-base text-gray-500 dark:text-zinc-400 text-center mt-4 mb-6">
              {t('media.doc_preview_error')}
            </Text>
            <TouchableOpacity
              onPress={save}
              className="bg-nexa rounded-full px-6 py-3 flex-row items-center"
            >
              <Ionicons name="download-outline" size={18} color="white" />
              <Text className="text-white font-semibold ml-2">{t('media.download')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="flex-1">
            <WebView
              source={{ uri: url }}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              onHttpError={() => {
                setLoading(false);
                setFailed(true);
              }}
              startInLoadingState={false}
              originWhitelist={['https://*']}
            />
            {loading ? (
              <View className="absolute inset-0 items-center justify-center bg-white dark:bg-zinc-950">
                <ActivityIndicator size="large" color={NEXA} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}
