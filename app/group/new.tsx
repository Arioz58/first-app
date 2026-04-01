import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../../lib/api';

export default function NewGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addMember = () => {
    const id = memberInput.trim();
    if (!id || memberIds.includes(id)) return;
    setMemberIds((prev) => [...prev, id]);
    setMemberInput('');
  };

  const handleCreate = async () => {
    if (!name.trim() || !memberIds.length) {
      Alert.alert('Erreur', 'Nom et au moins un membre requis');
      return;
    }
    setLoading(true);
    try {
      const conv = await apiRequest<{ id: string; name: string }>('/conversations/group', {
        method: 'POST',
        body: { name, memberIds },
      });
      router.replace({ pathname: '/chat/[id]' as any, params: { id: conv.id, name: conv.name } });
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
        <Text className="text-lg font-semibold text-gray-900">Nouveau groupe</Text>
      </View>

      <View className="px-4 mt-6 gap-4">
        <TextInput
          className="border border-gray-300 rounded-xl px-4 py-3 text-base"
          placeholder="Nom du groupe"
          value={name}
          onChangeText={setName}
        />

        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base"
            placeholder="ID d'un membre"
            value={memberInput}
            onChangeText={setMemberInput}
          />
          <TouchableOpacity
            className="bg-blue-800 rounded-xl px-4 items-center justify-center"
            onPress={addMember}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        </View>

        {memberIds.map((id) => (
          <View key={id} className="flex-row items-center justify-between bg-gray-50 rounded-xl px-4 py-2">
            <Text className="text-gray-700 text-sm" numberOfLines={1}>{id}</Text>
            <TouchableOpacity onPress={() => setMemberIds((prev) => prev.filter((m) => m !== id))}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          className="bg-blue-800 rounded-xl py-4 items-center mt-4"
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Créer le groupe</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
