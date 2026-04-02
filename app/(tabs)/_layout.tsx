import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import '../../lib/i18n';

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>Messages</Label>
        <Icon sf="message.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <Label>Recherche</Label>
        <Icon sf="magnifyingglass" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <Label>Appels</Label>
        <Icon sf="phone.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Label>Profil</Label>
        <Icon sf="person.fill" />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
