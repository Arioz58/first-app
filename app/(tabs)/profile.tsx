import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';
import { clearTokens } from '../../lib/storage';
import { disconnectSocket } from '../../lib/socket';

type User = { id: string; name: string; phone: string };

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<User>('/users/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: async () => {
          disconnectSocket();
          await clearTokens();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-blue-800">Profil</Text>
      </View>

      <View className="items-center mt-10 mb-8">
        <View className="w-20 h-20 rounded-full bg-blue-100 items-center justify-center mb-4">
          <Ionicons name="person" size={40} color="#1E40AF" />
        </View>
        <Text className="text-xl font-bold text-gray-900">{user?.name}</Text>
        <Text className="text-gray-500 mt-1">{user?.phone}</Text>
      </View>

      <TouchableOpacity
        className="mx-4 flex-row items-center bg-red-50 rounded-xl px-4 py-4"
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={22} color="#EF4444" />
        <Text className="ml-3 text-red-500 font-semibold">Déconnexion</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
