import { Badge, Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { usePendingFriendRequests } from '../../lib/friendRequests';
import { useUnreadMessages } from '../../lib/unreadMessages';
import '../../lib/i18n';

export default function TabLayout() {
  const { t } = useTranslation();
  const pendingRequests = usePendingFriendRequests();
  const unreadMessages = useUnreadMessages();

  return (
    <NativeTabs tintColor="#1E40AF">
      <NativeTabs.Trigger name="index">
        <Label>{t('tabs.messages')}</Label>
        <Icon sf="message.fill" />
        {/* Même contrainte que le badge des demandes d'ami plus bas : le nombre, et
            l'élément n'est pas monté du tout tant qu'il n'y a rien à signaler. */}
        {unreadMessages > 0 && (
          <Badge>{unreadMessages > 99 ? '99+' : String(unreadMessages)}</Badge>
        )}
      </NativeTabs.Trigger>

      {/* Actus (stories + activité + communauté) — les stories vivent ici, plus
          dans l'onglet Messages (comme l'onglet « Actus » de WhatsApp). */}
      <NativeTabs.Trigger name="updates">
        <Label>{t('tabs.updates')}</Label>
        <Icon sf="sparkles" />
      </NativeTabs.Trigger>

      {/* La route reste `search` (fichier search.tsx) — seul le libellé change. */}
      <NativeTabs.Trigger name="search">
        <Label>{t('tabs.contacts')}</Label>
        <Icon sf="person.2.fill" />
        {/* iOS affiche le badge comme du texte : on met le nombre, pas un point muet.
            `hidden` n'est pas honoré ici (le badge s'affichait avec « 0 ») → on ne
            monte carrément pas l'élément tant qu'il n'y a aucune demande. */}
        {pendingRequests > 0 && (
          <Badge>{pendingRequests > 99 ? '99+' : String(pendingRequests)}</Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <Label>{t('tabs.calls')}</Label>
        <Icon sf="phone.fill" />
      </NativeTabs.Trigger>

      {/* Onglet « Vous ». La photo de profil réelle n'est pas possible en icône :
          la tab bar native iOS rend les images en mode template (teintées) →
          une photo sortirait en silhouette unie. person.crop.circle.fill évoque
          un avatar tout en restant natif. */}
      <NativeTabs.Trigger name="profile">
        <Label>{t('tabs.profile')}</Label>
        <Icon sf="person.crop.circle.fill" />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
