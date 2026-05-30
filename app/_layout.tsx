import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import '../lib/i18n';
import { setSessionExpiredHandler } from '../lib/api';
import { registerForPushNotifications } from '../lib/notifications';
import { connectSocket } from '../lib/socket';
import { getAccessToken, getRefreshToken, clearTokens } from '../lib/storage';
import './globals.css';

const isTokenExpired = (token: string): boolean => {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => router.replace('/(auth)/login'));

    const init = async () => {
      const token = await getAccessToken();
      const refreshToken = await getRefreshToken();
      const inAuth = segments[0] === '(auth)';

      if (!token) {
        if (!inAuth) router.replace('/(auth)/login');
        setChecked(true);
        return;
      }

      const accessExpired = isTokenExpired(token);
      const refreshExpired = !refreshToken || isTokenExpired(refreshToken);

      if (accessExpired && refreshExpired) {
        await clearTokens();
        router.replace('/(auth)/login');
        setChecked(true);
        return;
      }

      if (inAuth) router.replace('/(tabs)');
      await connectSocket();
      await registerForPushNotifications();
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
