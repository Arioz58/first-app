import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import '../../lib/i18n';

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <NativeTabs tintColor="#128C7E">
      <NativeTabs.Trigger name="index">
        <Label>{t('tabs.messages')}</Label>
        <Icon sf="message.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <Label>{t('tabs.search')}</Label>
        <Icon sf="magnifyingglass" />
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
