import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Dimensions, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../lib/api';
import { getUserId } from '../lib/storage';
import { ROUND } from '../lib/radius';
import { useThemeColors } from '../lib/theme';
import BottomSheet from './BottomSheet';
import { UserAvatar } from './UserAvatar';

// ⚠️ Plafonnée à 75 % de l'écran : 560 px en dur occupaient presque tout l'affichage d'un
// petit iPhone, la feuille n'ayant alors plus l'air d'une feuille.
const SHEET_H = Math.min(560, Math.round(Dimensions.get('window').height * 0.75));

type ConvItem = {
  id: string;
  type: 'direct' | 'group';
  name?: string | null;
  photoUrl?: string | null;
  members?: { userId: string; user: { id: string; name: string; photoUrl?: string | null } }[];
};

/**
 * Choix des conversations vers lesquelles transférer un message.
 *
 * ⚠️ Multi-sélection : transférer une photo à trois personnes est le cas courant, et rouvrir
 * la feuille trois fois pour cela serait pénible. Le bouton porte le compte pour que l'envoi
 * ne parte jamais par surprise.
 */
export function ForwardSheet({
  visible,
  count = 1,
  title,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** Nombre de messages transférés — annoncé en titre quand il y en a plusieurs. */
  count?: number;
  /**
   * Titre de remplacement.
   *
   * ⚠️ La feuille sert aussi à ENVOYER une capture toute neuve (`app/capture.tsx`), pas
   * seulement à transférer un message existant : « Transférer à » y serait faux, on ne
   * transfère rien.
   */
  title?: string;
  onClose: () => void;
  /** Reçoit les identifiants de conversation retenus. L'envoi lui-même reste à l'appelant. */
  onConfirm: (conversationIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  // ⚠️ `BottomSheet` ne retire pas la zone sûre : son contenu descend jusqu'au bord de
  // l'écran, donc sous le *home indicator*. C'est au contenu de s'en occuper.
  const insets = useSafeAreaInsets();
  const [meId, setMeId] = useState<string | null>(null);
  const [items, setItems] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    // ⚠️ Rechargé à CHAQUE ouverture, et la sélection remise à zéro : la liste des
    // conversations bouge sans arrêt, et garder une sélection d'une ouverture à l'autre
    // ferait partir un transfert vers une conversation qu'on ne vise plus.
    setPicked([]);
    setQuery('');
    setLoading(true);
    // L'identité est lue depuis le stockage local, comme partout ailleurs : elle sert à
    // écarter l'utilisateur courant des participants (voir `other`).
    getUserId().then(setMeId).catch(() => {});
    apiRequest<ConvItem[]>('/conversations')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [visible]);

  /**
   * ⚠️ L'AUTRE participant, pas `members[0]`.
   *
   * `members` contient TOUS les participants, moi compris, et rien ne garantit mon rang :
   * prendre le premier affichait des lignes vides ou à mon propre nom, et la recherche ne
   * trouvait alors rien. C'est la règle suivie partout ailleurs dans le projet
   * (`members.find(m => m.userId !== currentUserId)`).
   */
  const other = (c: ConvItem) => c.members?.find((m) => m.user?.id !== meId)?.user ?? null;
  const label = (c: ConvItem) => (c.type === 'group' ? c.name ?? '' : other(c)?.name ?? '');
  const photo = (c: ConvItem) => (c.type === 'group' ? c.photoUrl : other(c)?.photoUrl);

  const filtered = query.trim()
    ? items.filter((c) => label(c).toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  const toggle = (convId: string) =>
    setPicked((prev) =>
      prev.includes(convId) ? prev.filter((x) => x !== convId) : [...prev, convId],
    );

  return (
    <BottomSheet visible={visible} onClose={onClose} height={SHEET_H}>
      <View className="px-5 pb-3">
        {/* Le compte est annoncé : transférer 6 messages sans le dire exposerait à en
            envoyer plus qu'on ne croit. */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-3">
          {title ?? (count > 1 ? t('chat.forward_n_to', { count }) : t('chat.forward_to'))}
        </Text>
        <View
          style={ROUND.inner}
          className="flex-row items-center bg-gray-100 dark:bg-zinc-800 px-3 py-2"
        >
          <Ionicons name="search" size={17} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.faint}
            className="flex-1 ml-2 text-base text-gray-900 dark:text-zinc-100"
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.nexa} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          // ⚠️ `meId` arrive de façon asynchrone et `picked` change à chaque appui : sans
          // `extraData`, la FlatList ne re-rendrait pas ses lignes — les noms resteraient
          // vides et les coches ne bougeraient pas.
          extraData={`${meId}-${picked.join(',')}`}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // La barre d'action est posée PAR-DESSUS la liste : sans cette réserve, la
          // dernière conversation resterait inatteignable dessous.
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: picked.length ? 92 : 8,
          }}
          ListEmptyComponent={
            <View className="items-center pt-10 px-6">
              <Ionicons name="chatbubbles-outline" size={34} color={colors.faint} />
              <Text className="text-base text-gray-400 dark:text-zinc-500 mt-3 text-center">
                {t('chat.no_conversations')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const on = picked.includes(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                className="flex-row items-center px-2 py-2.5"
              >
                <UserAvatar
                  name={label(item)}
                  photoUrl={photo(item)}
                  size={44}
                  group={item.type === 'group'}
                />
                <Text
                  numberOfLines={1}
                  className="flex-1 ml-3 text-base text-gray-900 dark:text-zinc-100"
                >
                  {label(item)}
                </Text>
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
                    on ? 'bg-nexa border-nexa' : 'border-gray-300 dark:border-zinc-600'
                  }`}
                >
                  {on && <Ionicons name="checkmark" size={14} color="white" />}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {picked.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(140)}
          style={{
            // Posée sur la liste plutôt qu'en flux : la feuille a une hauteur fixe, et une
            // barre qui pousse le contenu ferait sauter la liste à chaque sélection.
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            // ⚠️ Le repli à 12 couvre les appareils sans *home indicator*, où `insets.bottom`
            // vaut 0 : le bouton s'y collerait au bord de la feuille.
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: colors.surface,
          }}
          className="px-5 pt-3 border-t border-gray-100 dark:border-zinc-800"
        >
          <Pressable
            onPress={() => {
              onConfirm(picked);
              onClose();
            }}
            style={ROUND.bubble}
            className="bg-nexa py-3.5 flex-row items-center justify-center active:opacity-80"
          >
            <Text className="text-white text-base font-semibold">
              {t('chat.forward_count', { count: picked.length })}
            </Text>
            <Ionicons name="arrow-redo" size={17} color="white" style={{ marginLeft: 8 }} />
          </Pressable>
        </Animated.View>
      )}
    </BottomSheet>
  );
}
