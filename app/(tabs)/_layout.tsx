import { Badge, Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { usePendingFriendRequests } from '../../lib/friendRequests';
import '../../lib/i18n';

export default function TabLayout() {
  const { t } = useTranslation();
  const pendingRequests = usePendingFriendRequests();

  return (
    <NativeTabs tintColor="#128C7E">
      <NativeTabs.Trigger name="index">
        <Label>{t('tabs.messages')}</Label>
        <Icon sf="message.fill" />
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

      <NativeTabs.Trigger name="profile">
        <Label>{t('tabs.profile')}</Label>
        <Icon sf="person.fill" />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
