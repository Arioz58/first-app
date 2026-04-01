import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiRequest } from '../../lib/api';
import { saveTokens } from '../../lib/storage';
import { connectSocket } from '../../lib/socket';
import { registerForPushNotifications } from '../../lib/notifications';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!code.trim() || !name.trim()) return;
    setLoading(true);
    try {
      const data = await apiRequest<{ accessToken: string; refreshToken: string; user: { id: string } }>(
        '/auth/verify-code',
        { method: 'POST', body: { phone, code, name }, auth: false },
      );
      await saveTokens(data.accessToken, data.refreshToken, data.user.id);
      await connectSocket();
      await registerForPushNotifications();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Text className="text-3xl font-bold text-blue-800 mb-2">Vérification</Text>
      <Text className="text-gray-500 mb-8">Code envoyé au {phone}</Text>

      <TextInput
        className="border border-gray-300 rounded-xl px-4 py-3 text-base mb-4"
        placeholder="Votre prénom"
        value={name}
        onChangeText={setName}
      />

      <TextInput
        className="border border-gray-300 rounded-xl px-4 py-3 text-base mb-4"
        placeholder="Code OTP"
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
        autoFocus
      />

      <TouchableOpacity
        className="bg-blue-800 rounded-xl py-4 items-center"
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-base">Confirmer</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
