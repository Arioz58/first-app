import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../components/BottomSheet';
import { UserAvatar } from '../components/UserAvatar';
import { apiRequest } from '../lib/api';

const NEXA = '#1E40AF';
const TRIPLE = ['everyone', 'friends', 'nobody'] as const;
/**
 * Les réglages de VISIBILITÉ acceptent une quatrième valeur : « mes amis, sauf… ».
 *
 * ⚠️ Posée entre « mes amis » et « personne », comme chez WhatsApp : l'ordre va du plus
 * ouvert au plus fermé, et « sauf » restreint « mes amis » sans aller jusqu'à personne.
 *
 * ⚠️ Volontairement ABSENTE des réglages de contact (messages, appels, demandes d'ami) : y
 * écarter quelqu'un ne serait plus de la visibilité mais du blocage, qui existe déjà. Le
 * serveur refuse d'ailleurs la valeur sur ces champs-là.
 */
const VISIBILITY = ['everyone', 'friends', 'friends_except', 'nobody'] as const;

/** Les cinq champs qui acceptent une liste d'exclus. Doit rester aligné sur le serveur. */
const EXCEPT_FIELDS = [
  'privacyPhoto',
  'privacyBio',
  'privacyLastSeen',
  'privacyLocation',
  'privacyPhone',
] as const;
type ExceptField = (typeof EXCEPT_FIELDS)[number];

type Friend = { id: string; name: string; photoUrl: string | null };
const FR_VALUES = ['everyone', 'friends_of_friends', 'nobody'] as const;

type Privacy = {
  privacyPhoto: string;
  privacyBio: string;
  privacyLastSeen: string;
  privacyLocation: string;
  privacyPhone: string;
  privacyMessages: string;
  privacyCalls: string;
  privacyFriendRequests: string;
  locationEnabled: boolean;
  readReceipts: boolean;
};

type FieldKey = keyof Omit<Privacy, 'locationEnabled' | 'readReceipts'>;

// Champ → clé i18n du libellé
const LABEL_KEY: Record<FieldKey, string> = {
  privacyPhoto: 'photo',
  privacyBio: 'bio',
  privacyLastSeen: 'last_seen',
  privacyLocation: 'location',
  privacyPhone: 'phone',
  privacyMessages: 'messages',
  privacyCalls: 'calls',
  privacyFriendRequests: 'friend_requests',
};

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<{ key: FieldKey; options: readonly string[] } | null>(
    null,
  );
  /**
   * ⚠️ Ouverture SÉPARÉE de la cible : la feuille épouse la hauteur de son contenu, et ce
   * contenu dépend de `picker`. Le passer à `null` pour fermer le ferait disparaître AVANT
   * l'animation — la hauteur tombe à zéro et la feuille s'escamote au lieu de redescendre.
   * `picker` n'est donc lâché qu'une fois la feuille démontée (`onClosed`).
   */
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * Personnes écartées, par réglage.
   *
   * ⚠️ Des CARTES et non des identifiants : la ligne annonce un nombre, et la liste doit
   * nommer les gens. Le serveur les renvoie déjà ainsi, il n'y a rien à recomposer ici.
   */
  const [exceptions, setExceptions] = useState<Record<string, Friend[]>>({});
  /** Réglage dont on choisit les exclus ; `null` = aucun choix en cours. */
  const [exceptFor, setExceptFor] = useState<ExceptField | null>(null);
  const [exceptOpen, setExceptOpen] = useState(false);
  /**
   * Réglage dont le sélecteur d'exclus s'ouvrira UNE FOIS la feuille de valeurs démontée.
   *
   * ⚠️ DEUX `Modal` NE SE PRÉSENTENT PAS EN MÊME TEMPS. Ouvrir le second au tap, alors que le
   * premier est encore en train de se refermer, laisse sur iOS un modal fantôme : plus rien
   * n'est visible, mais il capte toutes les touches — l'app paraît figée et il faut la quitter
   * pour s'en sortir. C'est exactement ce que `onClosed` existe pour éviter (voir son
   * commentaire dans `BottomSheet`), et ce que la liste des conversations fait déjà pour
   * enchaîner ses deux feuilles de filtres.
   *
   * ⚠️ Une REF et non un état : elle est lue dans `onClosed`, qui part d'un callback de
   * ressort — un état y serait celui du rendu où l'écouteur a été posé.
   */
  const exceptPendingRef = useRef<ExceptField | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  /** Sélection EN COURS dans la feuille, validée seulement à la fermeture. */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiRequest<{ profile: Privacy }>('/users/me')
      .then((u) => setPrivacy(u.profile))
      .catch(() => {})
      .finally(() => setLoading(false));
    /**
     * ⚠️ Chargées d'emblée et non à l'ouverture d'une feuille : la LIGNE affiche déjà le
     * nombre d'exclus. Attendre le premier tap l'afficherait vide puis la corrigerait.
     */
    apiRequest<Record<string, Friend[]>>('/users/me/privacy/exceptions')
      .then(setExceptions)
      .catch(() => {});
  }, []);

  /**
   * ⚠️ `extra` ne passe PAS par l'état local : les listes d'exclus y vivent dans
   * `exceptions`, sous forme de cartes, alors que le serveur attend des identifiants. Les
   * mêler à `privacy` obligerait à tenir deux représentations de la même chose.
   */
  const patch = (data: Partial<Privacy>, extra?: Record<string, unknown>) => {
    setPrivacy((p) => (p ? { ...p, ...data } : p));
    apiRequest('/users/me/privacy', { method: 'PATCH', body: { ...data, ...extra } }).catch(
      () => {},
    );
  };

  const selectValue = (value: string) => {
    if (!picker) return;
    setPickerOpen(false);
    /**
     * « Mes amis, sauf… » n'est pas une valeur qu'on pose : c'est une question qu'on ouvre.
     *
     * ⚠️ Le réglage n'est PAS écrit ici. L'enregistrer tout de suite, avant que la liste
     * existe, laisserait un « sauf » sans personne dedans — donc un réglage qui se comporte
     * comme « mes amis » et montre à quelqu'un qu'on venait d'écarter. Valeur et liste
     * partent ensemble, à la validation.
     */
    if (value === 'friends_except') {
      const champ = picker.key as ExceptField;
      setSelected(new Set((exceptions[champ] ?? []).map((f) => f.id)));
      // Le chargement peut partir tout de suite : il ne présente aucun écran.
      if (!friends) {
        apiRequest<Friend[]>('/friends')
          .then(setFriends)
          .catch(() => setFriends([]));
      }
      // ⚠️ On NOTE le réglage, on n'ouvre rien : c'est `onClosed` qui prendra le relais.
      exceptPendingRef.current = champ;
      return;
    }
    patch({ [picker.key]: value } as Partial<Privacy>);
  };

  /** Bascule une personne dans la sélection en cours. */
  const toggleFriend = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Valide « mes amis, sauf… » : la valeur ET la liste, dans le même appel.
   *
   * ⚠️ Le serveur les écrit dans une transaction, précisément pour qu'on ne puisse pas se
   * retrouver avec l'une sans l'autre.
   */
  const validerExceptions = () => {
    const champ = exceptFor;
    setExceptOpen(false);
    if (!champ) return;
    const ids = [...selected];
    const cartes = (friends ?? []).filter((f) => selected.has(f.id));
    setExceptions((prev) => ({ ...prev, [champ]: cartes }));
    patch({ [champ]: 'friends_except' } as Partial<Privacy>, { [`${champ}Except`]: ids });
  };

  if (loading || !privacy) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-900">
        <ActivityIndicator size="large" color={NEXA} />
      </View>
    );
  }

  /**
   * ⚠️ Les valeurs admises sont DÉDUITES du champ, elles ne sont plus passées par l'appelant :
   * c'est la même règle que le serveur applique, et la répéter à huit endroits garantissait
   * qu'un jour l'un d'eux resterait en arrière.
   */
  const Row = ({ field }: { field: FieldKey }) => {
    const options: readonly string[] =
      field === 'privacyFriendRequests'
        ? FR_VALUES
        : (EXCEPT_FIELDS as readonly string[]).includes(field)
          ? VISIBILITY
          : TRIPLE;
    return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-4 border-b border-gray-50 dark:border-zinc-800"
      onPress={() => {
        setPicker({ key: field, options });
        setPickerOpen(true);
      }}
    >
      <Text className="flex-1 text-lg text-gray-900 dark:text-zinc-100">
        {t(`privacy_settings.${LABEL_KEY[field]}` as any)}
      </Text>
      <Text className="text-gray-400 dark:text-zinc-500 mr-1">
        {/* ⚠️ Le NOMBRE d'exclus est annoncé ici : « mes amis, sauf… » sans chiffre ne dit
            pas si la liste contient une personne ou douze, ni si on a oublié de la remplir. */}
        {privacy[field] === 'friends_except'
          ? t('privacy_settings.friends_except_count', {
              count: (exceptions[field] ?? []).length,
            })
          : t(`privacy_settings.${privacy[field]}` as any)}
      </Text>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-950">
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={NEXA} />
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
          {t('privacy_settings.title')}
        </Text>
      </View>

      <ScrollView>
        <Text className="px-4 pt-5 pb-1 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
          {t('privacy_settings.section_visibility')}
        </Text>
        <View className="bg-white dark:bg-zinc-900">
          <Row field="privacyPhoto" />
          <Row field="privacyBio" />
          <Row field="privacyLastSeen" />
          <Row field="privacyPhone" />

          {/* Localisation : toggle de partage + qui peut la voir */}
          <View className="flex-row items-center px-4 py-4 border-b border-gray-50 dark:border-zinc-800">
            <Text className="flex-1 text-lg text-gray-900 dark:text-zinc-100">
              {t('privacy_settings.location_enabled')}
            </Text>
            <Switch
              value={privacy.locationEnabled}
              onValueChange={(v) => patch({ locationEnabled: v })}
              trackColor={{ true: NEXA }}
            />
          </View>
          {privacy.locationEnabled && <Row field="privacyLocation" />}

          {/* Accusés de lecture — réciproque, d'où le libellé d'aide sous le titre. */}
          <View className="flex-row items-center px-4 py-4">
            <View className="flex-1 pr-3">
              <Text className="text-lg text-gray-900 dark:text-zinc-100">
                {t('privacy_settings.read_receipts')}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
                {t('privacy_settings.read_receipts_hint')}
              </Text>
            </View>
            <Switch
              value={privacy.readReceipts}
              onValueChange={(v) => patch({ readReceipts: v })}
              trackColor={{ true: NEXA }}
            />
          </View>
        </View>

        <Text className="px-4 pt-5 pb-1 text-sm font-semibold uppercase text-gray-400 dark:text-zinc-500">
          {t('privacy_settings.section_contact')}
        </Text>
        <View className="bg-white dark:bg-zinc-900">
          <Row field="privacyMessages" />
          <Row field="privacyCalls" />
          <Row field="privacyFriendRequests" />
        </View>

        {/* Utilisateurs bloqués */}
        <View className="bg-white dark:bg-zinc-900 mt-5">
          <TouchableOpacity
            className="flex-row items-center px-4 py-4"
            onPress={() => router.push('/blocked' as any)}
          >
            <Ionicons name="ban-outline" size={20} color="#EF4444" />
            <Text className="flex-1 ml-3 text-lg text-gray-900 dark:text-zinc-100">
              {t('moderation.blocked_users')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <View className="h-8" />
      </ScrollView>

      {/* Sélecteur de valeur */}
      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onClosed={() => {
          setPicker(null);
          const champ = exceptPendingRef.current;
          if (!champ) return;
          exceptPendingRef.current = null;
          setExceptFor(champ);
          /**
           * ⚠️ UNE IMAGE D'ÉCART EN PLUS du démontage. `onClosed` part du callback du ressort,
           * donc avant que React ait appliqué le démontage à l'écran : présenter dans la
           * foulée retombe sur le modal fantôme. Même précaution que l'enchaînement des
           * feuilles de filtres dans la liste des conversations.
           */
          requestAnimationFrame(() => setExceptOpen(true));
        }}
      >
        <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100 px-5 pt-1 pb-2">
          {picker ? t(`privacy_settings.${LABEL_KEY[picker.key]}` as any) : ''}
        </Text>
        {picker?.options.map((opt) => {
          const active = privacy[picker.key] === opt;
          return (
            <TouchableOpacity
              key={opt}
              className="flex-row items-center px-5 py-4"
              onPress={() => selectValue(opt)}
            >
              <Text
                className={`flex-1 text-lg ${active ? 'font-bold' : 'text-gray-900 dark:text-zinc-100'}`}
                style={active ? { color: NEXA } : undefined}
              >
                {t(`privacy_settings.${opt}` as any)}
              </Text>
              {active && <Ionicons name="checkmark-circle" size={22} color={NEXA} />}
            </TouchableOpacity>
          );
        })}
        <View className="pb-8" />
      </BottomSheet>

      {/*
        Choix des personnes écartées.
        ⚠️ HAUTEUR FIXE : c'est une liste, et une feuille qui épouse son contenu changerait de
        taille au chargement des amis, puis à chaque filtre. Même règle que le sélecteur de pays.
      */}
      <BottomSheet
        visible={exceptOpen}
        onClose={validerExceptions}
        onClosed={() => setExceptFor(null)}
        height={520}
      >
        <View className="flex-row items-center px-5 pt-1 pb-3">
          <View className="flex-1 pr-3">
            <Text className="text-xl font-bold text-gray-900 dark:text-zinc-100">
              {t('privacy_settings.except_title')}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
              {exceptFor
                ? t('privacy_settings.except_hint', {
                    field: t(`privacy_settings.${LABEL_KEY[exceptFor]}` as any),
                  })
                : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={validerExceptions} className="px-2 py-1">
            <Text className="text-lg font-semibold" style={{ color: NEXA }}>
              {t('privacy_settings.except_done')}
            </Text>
          </TouchableOpacity>
        </View>

        {friends === null ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={NEXA} />
          </View>
        ) : friends.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-gray-500 dark:text-zinc-400">
              {t('privacy_settings.except_no_friends')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(f) => f.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              const coche = selected.has(item.id);
              return (
                <TouchableOpacity
                  className="flex-row items-center px-5 py-3"
                  onPress={() => toggleFriend(item.id)}
                >
                  <UserAvatar name={item.name} photoUrl={item.photoUrl} size={40} />
                  <Text className="flex-1 ml-3 text-lg text-gray-900 dark:text-zinc-100">
                    {item.name}
                  </Text>
                  {/* ⚠️ Une case à cocher et non une coche seule : la sélection doit se voir
                      AUSSI quand elle est vide, sinon rien ne dit que la ligne est cochable. */}
                  <Ionicons
                    name={coche ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={coche ? NEXA : '#9CA3AF'}
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}
