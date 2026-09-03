import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomSheet from './BottomSheet';
import { UserAvatar } from './UserAvatar';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';
import { FILTER_COLORS, FILTER_PRESETS, type CustomFilter } from '../lib/customFilters';

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
 * ⚠️ Le choix des conversations est une SECONDE feuille, rendue DANS la première et non à
 * côté. C'est ce que fait déjà `CountryPicker` dans `AddContactSheet`, et c'est ce que
 * `claimRecede` prévoit explicitement : seule la feuille la plus basse fait reculer l'écran,
 * celle du dessus se pose par-dessus sans le reculer une seconde fois.
 *
 * ⚠️ À ne pas confondre avec le piège documenté sur `onClosed` : celui-là concerne le fait
 * de PRÉSENTER quelque chose pendant qu'une feuille se FERME. Ici les deux coexistent, ce
 * qui est un cas différent et pris en charge.
 *
 * ⚠️ La liste des conversations est FOURNIE par l'écran, qui l'a déjà chargée : la recharger
 * ici doublerait une requête pour afficher la même chose, et les deux pourraient diverger le
 * temps d'un aller-retour.
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
  onSubmit: (name: string, conversationIds: string[], color: string) => Promise<void>;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  // ⚠️ `BottomSheet` ne retire PAS la zone sûre : son contenu descend jusqu'au bord de
  // l'écran, donc sous le *home indicator*. C'est au contenu de s'en occuper.
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [color, setColor] = useState(FILTER_COLORS[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** Seconde feuille (choix des conversations) ouverte par-dessus la première. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setColor(initial?.color ?? FILTER_COLORS[0]);
    setPickerOpen(false);
    setQuery('');
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => c.name.toLowerCase().includes(q)) : conversations;
  }, [conversations, query]);

  /** Les conversations retenues, dans l'ordre de la liste — pour l'aperçu de l'étape 1. */
  const pickedItems = useMemo(
    () => conversations.filter((c) => picked.includes(c.id)),
    [conversations, picked],
  );

  const submit = () => {
    if (!name.trim() || !picked.length || busy) return;
    setBusy(true);
    onSubmit(name.trim(), picked, color).finally(() => setBusy(false));
  };

  const canSave = !!name.trim() && picked.length > 0 && !busy;

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} height={560}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        <View className="px-5 pt-1">
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

          {/* Modèles : un nom et une couleur d'un seul geste. ⚠️ Proposés à la CRÉATION
              seulement — en modification, ils écraseraient un nom déjà choisi. */}
          {!initial && (
            <>
              <Text className="mt-4 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
                {t('filters.presets')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                // ⚠️ `flexGrow: 0` : un ScrollView horizontal s'étire en hauteur dans un
                // parent en colonne et laisserait une bande vide.
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ paddingVertical: 8 }}
              >
                {FILTER_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => {
                      setName(t(`filters.preset_${p.key}`));
                      setColor(p.color);
                    }}
                    style={ROUND.inner}
                    className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3 py-2 mr-2"
                  >
                    <View
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: p.color }}
                    />
                    <Text className="text-base text-gray-700 dark:text-zinc-200">
                      {t(`filters.preset_${p.key}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <Text className="mt-3 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
            {t('filters.color')}
          </Text>
          {/* ⚠️ La couleur retenue porte une COCHE, pas seulement un anneau : un anneau seul
              se confond avec une pastille voisine dès qu'il y en a seize, et sur les teintes
              sombres il devenait invisible. La coche se lit quelle que soit la couleur. */}
          <View className="flex-row flex-wrap py-2">
            {FILTER_COLORS.map((c) => {
              const on = color === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  accessibilityLabel={c}
                  accessibilityState={{ selected: on }}
                  className="w-9 h-9 rounded-full mr-2.5 mb-2.5 items-center justify-center"
                  style={{ backgroundColor: c }}
                >
                  {on && <Ionicons name="checkmark" size={20} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Accès au choix des conversations. ⚠️ Un bouton et non la liste entière : celle-ci
              occupait tout l'écran et noyait le nom et la couleur, qui sont l'essentiel. */}
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            style={ROUND.inner}
            className="mt-2 flex-row items-center bg-gray-100 dark:bg-zinc-800 px-4 py-3.5"
          >
            <Ionicons name="add-circle" size={22} color={colors.nexa} />
            <Text className="flex-1 ml-3 text-lg text-gray-900 dark:text-zinc-100">
              {t('filters.add_people')}
            </Text>
            {picked.length > 0 && (
              <Text className="text-base font-semibold text-nexa mr-1">{picked.length}</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Conversations retenues : sans cette liste, le compte seul n'apprend pas ce qu'on
              a coché, et il faudrait rouvrir la feuille de choix pour le vérifier.

              ⚠️ Rendu par un `map` et non une `FlatList` : on est déjà DANS un `ScrollView`
              vertical, et imbriquer deux listes virtualisées de même orientation casse la
              virtualisation (React Native le signale explicitement). Le nombre de lignes est
              de toute façon celui qu'on vient de cocher à la main. */}
          {pickedItems.length > 0 && (
            <View className="mt-2">
              {pickedItems.map((c) => (
                <View key={c.id} className="flex-row items-center py-2">
                  <UserAvatar photoUrl={c.photoUrl} name={c.name} size={40} group={c.isGroup} />
                  <Text
                    className="flex-1 ml-3 text-lg text-gray-900 dark:text-zinc-100"
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                  {/* ⚠️ Le retrait est sur l'ICÔNE seule, pas sur la ligne entière : une ligne
                      entièrement cliquable qui SUPPRIME se déclenche par erreur, et il n'y a
                      pas d'annulation — il faudrait rouvrir la liste pour recocher. */}
                  <TouchableOpacity
                    onPress={() => toggle(c.id)}
                    hitSlop={10}
                    accessibilityLabel={`${t('filters.remove')} ${c.name}`}
                    className="p-1"
                  >
                    <Ionicons name="close-circle" size={24} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ⚠️ La zone sûre est retirée ICI : sans elle le bouton descend sous le *home
          indicator*, ce qui le fait paraître trop bas et rend son bord difficile à viser.
          Repli à 12 pour les appareils qui n'en ont pas. */}
      <View
        className="flex-row items-center gap-3 px-5 pt-3 border-t border-gray-100 dark:border-zinc-800"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
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

      {/* Seconde feuille, POSÉE SUR la première (voir l'en-tête du fichier). */}
      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        height={560}
        // ⚠️ Backdrop plus discret : deux voiles à 0.55 empilés noircissent presque
        // complètement l'écran, et la feuille du dessous disparaît.
        backdropOpacity={0.3}
      >
        <View className="flex-row items-center px-3 pt-1 pb-2">
          <TouchableOpacity onPress={() => setPickerOpen(false)} className="p-2" hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.content} />
          </TouchableOpacity>
          <Text className="flex-1 text-lg font-bold text-gray-900 dark:text-zinc-100">
            {t('filters.pick')}
          </Text>
          <TouchableOpacity onPress={() => setPickerOpen(false)} className="px-3 py-2">
            <Text className="text-lg font-semibold text-nexa">{t('filters.done')}</Text>
          </TouchableOpacity>
        </View>

        <View className="px-5 pb-2">
          <View
            style={ROUND.inner}
            className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3"
          >
            <Ionicons name="search" size={18} color="#6B7280" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('filters.search')}
              placeholderTextColor="#9CA3AF"
              className="flex-1 py-2.5 px-2 text-lg text-gray-900 dark:text-zinc-100"
              autoCorrect={false}
            />
          </View>
        </View>

        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <Text className="text-center text-gray-400 dark:text-zinc-500 mt-8">
              {t('filters.none_found')}
            </Text>
          }
          renderItem={({ item }) => {
            const on = picked.includes(item.id);
            return (
              <TouchableOpacity
                className="flex-row items-center px-5 py-2.5"
                onPress={() => toggle(item.id)}
                activeOpacity={0.7}
              >
                <UserAvatar
                  photoUrl={item.photoUrl}
                  name={item.name}
                  size={40}
                  group={item.isGroup}
                />
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
      </BottomSheet>
    </BottomSheet>
  );
}
