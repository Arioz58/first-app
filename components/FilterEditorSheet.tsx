import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';

import BottomSheet from './BottomSheet';
import { UserAvatar } from './UserAvatar';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';
import type { CustomFilter } from '../lib/customFilters';

/** Conversation proposée au choix — le minimum pour la ligne, fourni par l'écran appelant. */
export type FilterPickItem = {
  id: string;
  name: string;
  photoUrl: string | null;
  isGroup: boolean;
};

/**
 * Création et modification d'un filtre personnalisé.
 *
 * ⚠️ La liste des conversations est FOURNIE par l'écran, qui l'a déjà chargée : la
 * recharger ici doublerait une requête pour afficher exactement la même chose, et les deux
 * pourraient diverger le temps d'un aller-retour.
 *
 * ⚠️ `initial` sert à pré-remplir, mais n'est lu qu'à L'OUVERTURE (`visible` passe à vrai) :
 * le relire à chaque rendu écraserait ce que l'utilisateur est en train de taper.
 */
export function FilterEditorSheet({
  visible,
  initial,
  conversations,
  onClose,
  onClosed,
  onSubmit,
  onDelete,
}: {
  visible: boolean;
  /** `null` = création. */
  initial: CustomFilter | null;
  conversations: FilterPickItem[];
  onClose: () => void;
  /** Appelé une fois la feuille démontée — pour lâcher `initial` sans escamoter l'animation. */
  onClosed?: () => void;
  onSubmit: (name: string, conversationIds: string[]) => Promise<void>;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    /**
     * ⚠️ Restreint aux conversations RÉELLEMENT présentes : un filtre peut porter
     * l'identifiant d'une conversation quittée ou supprimée depuis. Le garder tel quel le
     * réécrirait en base à chaque enregistrement, et le compte affiché serait faux.
     */
    const known = new Set(conversations.map((c) => c.id));
    setPicked((initial?.conversationIds ?? []).filter((id) => known.has(id)));
    // ⚠️ `conversations` volontairement hors dépendances : la liste peut se rafraîchir
    // pendant l'édition (un message reçu la réordonne), et cela relancerait la
    // réinitialisation en effaçant la saisie en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () => {
    if (!name.trim() || !picked.length || busy) return;
    setBusy(true);
    onSubmit(name.trim(), picked).finally(() => setBusy(false));
  };

  const canSave = !!name.trim() && picked.length > 0 && !busy;

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} height={560}>
      <View className="px-5 pt-1 pb-3">
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100">
          {initial ? t('filters.edit') : t('filters.add')}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('filters.name_placeholder')}
          placeholderTextColor="#9CA3AF"
          maxLength={40}
          style={ROUND.inner}
          className="mt-3 bg-gray-100 dark:bg-zinc-800 px-4 py-3 text-lg text-gray-900 dark:text-zinc-100"
        />
        <Text className="mt-3 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
          {t('filters.pick')}
          {picked.length > 0 ? ` · ${t('filters.selected', { count: picked.length })}` : ''}
        </Text>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          return (
            <TouchableOpacity
              className="flex-row items-center px-5 py-2.5"
              onPress={() => toggle(item.id)}
              activeOpacity={0.7}
            >
              <UserAvatar photoUrl={item.photoUrl} name={item.name} size={40} group={item.isGroup} />
              <Text
                className="flex-1 ml-3 text-lg text-gray-900 dark:text-zinc-100"
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View
                className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
                  on ? 'bg-nexa border-nexa' : 'border-gray-300 dark:border-zinc-600'
                }`}
              >
                {on && <Ionicons name="checkmark" size={15} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <View className="flex-row items-center gap-3 px-5 py-4">
        {onDelete && (
          <TouchableOpacity
            onPress={onDelete}
            className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950 items-center justify-center"
          >
            <Ionicons name="trash" size={20} color="#DC2626" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          disabled={!canSave}
          onPress={submit}
          style={ROUND.inner}
          className={`flex-1 py-3.5 items-center ${canSave ? 'bg-nexa' : 'bg-gray-200 dark:bg-zinc-800'}`}
        >
          {busy ? (
            <ActivityIndicator color={canSave ? '#fff' : colors.muted} />
          ) : (
            <Text
              className={`text-lg font-semibold ${canSave ? 'text-white' : 'text-gray-400 dark:text-zinc-500'}`}
            >
              {t('filters.save')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
