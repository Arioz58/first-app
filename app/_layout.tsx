import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import '../lib/i18n';
import { registerForPushNotifications } from '../lib/notifications';
import { connectSocket } from '../lib/socket';
import { getAccessToken } from '../lib/storage';
import './globals.css';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const init = async () => {
      const token = await getAccessToken();
      const inAuth = segments[0] === '(auth)';

      if (!token && !inAuth) {
        router.replace('/(auth)/login');
      } else if (token && inAuth) {
        router.replace('/(tabs)');
      }

      if (token) {
        await connectSocket();
        await registerForPushNotifications();
      }

      setChecked(true);
    };

    init();
  }, []);

  if (!checked) return null;

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="group/new" options={{ headerShown: false }} />
      <Stack.Screen name="story/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="story/create" options={{ headerShown: false }} />
    </Stack>
  );
}
