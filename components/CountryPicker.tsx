import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet from "./BottomSheet";
import { COUNTRIES, Country } from "../lib/countries";

type Props = {
  selected: Country;
  onSelect: (country: Country) => void;
};

const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.85);

export default function CountryPicker({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search),
  );

  const close = () => {
    setVisible(false);
    setSearch("");
  };

  const handleSelect = (country: Country) => {
    onSelect(country);
    close();
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

      <BottomSheet visible={visible} onClose={close} height={SHEET_HEIGHT}>
        <View className="flex-row items-center px-5 pt-1 pb-2">
          <Text className="text-lg font-semibold text-gray-900 flex-1">
            {t("country_picker.title")}
          </Text>
          <TouchableOpacity onPress={close}>
            <Ionicons name="close" size={26} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View className="px-4 py-3">
          <TextInput
            className="bg-gray-100 rounded-xl px-4 py-3 text-base"
            placeholder={t("country_picker.search")}
            placeholderTextColor="#6B7280"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
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
      </BottomSheet>
    </>
  );
}
