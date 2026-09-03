import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomSheet from './BottomSheet';
import { ROUND } from '../lib/radius';
import type { CustomFilter } from '../lib/customFilters';

/**
 * Gestion des filtres personnalisés — la porte d'entrée du « + » quand il en existe déjà.
 *
 * ⚠️ Sa raison d'être est la DÉCOUVRABILITÉ. Modifier un filtre était possible dès le
 * départ, par appui long sur sa puce, mais rien ne l'annonçait : s'être trompé d'une
 * conversation menait à une impasse apparente. L'appui long reste, comme raccourci.
 *
 * ⚠️ N'apparaît PAS quand aucun filtre n'existe : le « + » mène alors directement à la
 * création. Une liste vide avec un seul bouton est une étape pour rien.
 */
export function FilterManagerSheet({
  visible,
  filters,
  onClose,
  onClosed,
  onEdit,
  onCreate,
}: {
  visible: boolean;
  filters: CustomFilter[];
  onClose: () => void;
  /** Appelé une fois la feuille démontée — c'est là que l'appelant ouvre l'éditeur. */
  onClosed?: () => void;
  /** L'appelant referme cette feuille AVANT d'ouvrir l'éditeur (voir `onClosed`). */
  onEdit: (filter: CustomFilter) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  // ⚠️ `BottomSheet` ne retire pas la zone sûre : c'est au contenu de le faire.
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} height={480}>
      <View className="px-5 pt-1 pb-2">
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100">
          {t('filters.manage')}
        </Text>
        <Text className="text-base text-gray-400 dark:text-zinc-500 mt-0.5">
          {t('filters.edit_hint')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.id}
            onPress={() => onEdit(f)}
            className="flex-row items-center px-5 py-3"
            activeOpacity={0.7}
          >
            <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: f.color }}>
              <Ionicons name="funnel" size={17} color="#fff" />
            </View>
            <View className="flex-1 ml-3">
              <Text
                className="text-lg font-semibold text-gray-900 dark:text-zinc-100"
                numberOfLines={1}
              >
                {f.name}
              </Text>
              <Text className="text-base text-gray-400 dark:text-zinc-500">
                {t('filters.people_count', { count: f.conversationIds.length })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View
        className="px-5 pt-3 border-t border-gray-100 dark:border-zinc-800"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <TouchableOpacity
          onPress={onCreate}
          style={ROUND.inner}
          className="flex-row items-center justify-center bg-nexa py-3.5"
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text className="ml-2 text-lg font-semibold text-white">{t('filters.create')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
