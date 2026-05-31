import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CountryPicker from "../../components/CountryPicker";
import { apiRequest } from "../../lib/api";
import { COUNTRIES, Country } from "../../lib/countries";

export default function LoginScreen() {
  const router = useRouter();
  const { isNew } = useLocalSearchParams<{ isNew: string }>();
  const isNewUser = isNew === "1";

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        Animated.timing(translateY, {
          toValue: -e.endCoordinates.height / 2,
          duration: (e.duration || 250) * 0.5,
          useNativeDriver: true,
        }).start();
      },
    );

    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (e) => {
        Animated.timing(translateY, {
          toValue: 0,
          duration: (e.duration || 250) * 0.5,
          useNativeDriver: true,
        }).start();
      },
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleSend = async () => {
    if (!phone.trim()) return;
    if (isNewUser && !name.trim()) return;
    setLoading(true);
    try {
      await apiRequest("/auth/send-code", {
        method: "POST",
        body: { phone: country.dialCode + phone },
        auth: false,
      });
      router.push({
        pathname: "/(auth)/verify" as any,
        params: { phone: country.dialCode + phone, name },
      });
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center px-4 py-3">
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              router.back();
            }}
          >
            <Ionicons name="arrow-back" size={28} color="#128C7E" />
          </TouchableOpacity>
        </View>

        <Animated.View
          className="flex-1 justify-center px-8"
          style={{ transform: [{ translateY }] }}
        >
          <View className="items-center mb-5">
            <Image
              source={require("../../assets/images/welcome_phone.png")}
              className="w-full h-32"
              resizeMode="contain"
            />
          </View>
          <Text className="text-4xl font-black text-nexa italic">
            {isNewUser ? "Créer un compte" : "Connexion"}
          </Text>
          <Text className="text-2xl font-medium italic text-nexa mb-4">
            {isNewUser
              ? "Entrez vos informations pour commencer"
              : "Entrez votre numéro de téléphone"}
          </Text>

          {isNewUser && (
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-xl mb-4 mt-4"
              placeholder="Votre prénom"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="next"
            />
          )}

          <View className="flex-row mb-6">
            <CountryPicker selected={country} onSelect={setCountry} />
            <TextInput
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-xl"
              placeholder="6 00 00 00 00"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              autoFocus={!isNewUser}
            />
          </View>

          <TouchableOpacity
            className="bg-nexa rounded-[2rem] py-6 items-center"
            onPress={handleSend}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-2xl italic">
                Recevoir le code →
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
