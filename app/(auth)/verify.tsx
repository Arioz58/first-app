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
import { MotiView } from "moti";
import { apiRequest } from "../../lib/api";
import { registerForPushNotifications } from "../../lib/notifications";
import { connectSocket } from "../../lib/socket";
import { saveTokens } from "../../lib/storage";

export default function VerifyScreen() {
  const router = useRouter();
  const { phone, name } = useLocalSearchParams<{
    phone: string;
    name: string;
  }>();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
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

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/\D/g, "");

    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6);
      const newDigits = ["", "", "", "", "", ""];
      pasted.split("").forEach((d, i) => {
        newDigits[i] = d;
      });
      setDigits(newDigits);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);

    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join("");
    if (code.length < 6) return;
    setLoading(true);
    try {
      const data = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: { id: string };
      }>("/auth/verify-code", {
        method: "POST",
        body: { phone, code, name: name || "" },
        auth: false,
      });
      await saveTokens(data.accessToken, data.refreshToken, data.user.id);
      await connectSocket();
      await registerForPushNotifications();
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const code = digits.join("");

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView className="flex-1 bg-white" edges={["bottom", "left", "right"]}>
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
          <MotiView
            from={{ opacity: 0, translateY: 30 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500, delay: 100 }}
          >
            <Text className="text-5xl font-black text-nexa italic">
              Vérification
            </Text>
            <Text className="text-2xl font-medium italic text-nexa mb-6">
              Code envoyé au {phone}
            </Text>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 40 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500, delay: 250 }}
            className="items-center"
          >
            <Image
              source={require("../../assets/images/welcome_message.png")}
              className="w-full h-40 mb-8"
              resizeMode="contain"
            />
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500, delay: 350 }}
            className="flex-row justify-between mb-10"
          >
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                className={`w-14 h-16 border-2 rounded-2xl text-center text-3xl font-bold ${
                  digit
                    ? "border-nexa text-nexa"
                    : "border-gray-300 text-gray-900"
                }`}
                keyboardType="number-pad"
                maxLength={6}
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                autoFocus={index === 0}
                selectTextOnFocus
              />
            ))}
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500, delay: 450 }}
          >
          <TouchableOpacity
            className={`rounded-[2rem] py-6 items-center ${code.length === 6 ? "bg-nexa" : "bg-gray-200"}`}
            onPress={handleVerify}
            disabled={loading || code.length < 6}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                className={`font-semibold text-2xl italic ${code.length === 6 ? "text-white" : "text-gray-400"}`}
              >
                Confirmer →
              </Text>
            )}
          </TouchableOpacity>
          </MotiView>
        </Animated.View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
