import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';

export default function CreateStoryScreen() {
  const router = useRouter();
  const [mediaUrl, setMediaUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!mediaUrl.trim()) return;
    setLoading(true);
    try {
      await apiRequest('/stories', { method: 'POST', body: { mediaUrl } });
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#1E40AF" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900">Nouvelle story</Text>
      </View>

      <View className="px-4 mt-6 gap-4">
        <Text className="text-gray-500 text-sm">
          Colle l'URL d'une image — le partage de médias via S3 sera disponible au Mois 3.
        </Text>

        <TextInput
          className="border border-gray-300 rounded-xl px-4 py-3 text-base"
          placeholder="https://exemple.com/photo.jpg"
          value={mediaUrl}
          onChangeText={setMediaUrl}
          autoCapitalize="none"
          keyboardType="url"
          autoFocus
        />

        <TouchableOpacity
          className="bg-blue-800 rounded-xl py-4 items-center"
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Publier (24h)</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
