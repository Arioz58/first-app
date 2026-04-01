import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '../../lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      await apiRequest('/auth/send-code', { method: 'POST', body: { phone }, auth: false });
      router.push({ pathname: '/(auth)/verify', params: { phone } });
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Text className="text-3xl font-bold text-blue-800 mb-2">Bienvenue</Text>
      <Text className="text-gray-500 mb-8">Entrez votre numéro de téléphone</Text>

      <TextInput
        className="border border-gray-300 rounded-xl px-4 py-3 text-base mb-4"
        placeholder="+33600000000"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        autoFocus
      />

      <TouchableOpacity
        className="bg-blue-800 rounded-xl py-4 items-center"
        onPress={handleSend}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-base">Recevoir le code</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
