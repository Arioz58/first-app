import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COUNTRIES, Country } from '../lib/countries';

type Props = {
  selected: Country;
  onSelect: (country: Country) => void;
};

export default function CountryPicker({ selected, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search),
  );

  const handleSelect = (country: Country) => {
    onSelect(country);
    setVisible(false);
    setSearch('');
  };

  return (
    <>
      <TouchableOpacity
        className="flex-row items-center border border-gray-300 rounded-xl px-3 py-3 mr-2"
        onPress={() => setVisible(true)}
      >
        <Text className="text-xl mr-1">{selected.flag}</Text>
        <Text className="text-base text-gray-700 mr-1">{selected.dialCode}</Text>
        <Ionicons name="chevron-down" size={16} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900 flex-1">Choisir un pays</Text>
            <TouchableOpacity onPress={() => { setVisible(false); setSearch(''); }}>
              <Ionicons name="close" size={26} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View className="px-4 py-3">
            <TextInput
              className="bg-gray-100 rounded-xl px-4 py-3 text-base"
              placeholder="Rechercher un pays ou un indicatif..."
              placeholderTextColor="#6B7280"
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3 border-b border-gray-50"
                onPress={() => handleSelect(item)}
              >
                <Text className="text-2xl mr-3">{item.flag}</Text>
                <Text className="flex-1 text-base text-gray-900">{item.name}</Text>
                <Text className="text-base text-gray-500">{item.dialCode}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
