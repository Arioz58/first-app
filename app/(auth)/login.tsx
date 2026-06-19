import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MotiView } from "moti";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  Linking,
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
import { PRIVACY_URL } from "../../lib/config";
import { COUNTRIES, Country } from "../../lib/countries";

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isNew } = useLocalSearchParams<{ isNew: string }>();
  const isNewUser = isNew === "1";

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false); // consentement politique de confidentialité (inscription)
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [serverError, setServerError] = useState("");
  const [buttonError, setButtonError] = useState(false);

  const translateY = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

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

  const triggerError = () => {
    setButtonError(true);
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 12,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -12,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 4,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => setButtonError(false), 100);
    });
  };

  const validate = (): boolean => {
    let valid = true;
    setNameError("");
    setPhoneError("");
    setServerError("");

    if (isNewUser && !name.trim()) {
      setNameError(t("auth.name_required"));
      valid = false;
    } else if (isNewUser && name.trim().length < 2) {
      setNameError(t("auth.name_too_short"));
      valid = false;
    }

    if (!phone.trim()) {
      setPhoneError(t("auth.phone_required"));
      valid = false;
    } else if (phone.replace(/\s/g, "").length < 5) {
      setPhoneError(t("auth.phone_too_short"));
      valid = false;
    }

    return valid;
  };

  const handleSend = async () => {
    Keyboard.dismiss();
    if (!validate()) {
      triggerError();
      return;
    }

    setLoading(true);
    // Normalise au format E.164 : indicatif + numéro sans espaces ni 0 de tête
    const fullPhone =
      country.dialCode + phone.replace(/\s/g, "").replace(/^0+/, "");
    try {
      await apiRequest("/auth/send-code", {
        method: "POST",
        body: {
          phone: fullPhone,
          mode: isNewUser ? "signup" : "login",
        },
        auth: false,
      });
      router.push({
        pathname: "/(auth)/verify" as any,
        params: { phone: fullPhone, name, isNew: isNewUser ? "1" : "0" },
      });
    } catch (e: any) {
      setServerError(e.message || t("auth.generic_error"));
      triggerError();
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field: "name" | "phone") => {
    if (field === "name") setNameError("");
    if (field === "phone") setPhoneError("");
    setServerError("");
    setButtonError(false);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView
        className="flex-1 bg-white"
        edges={["bottom", "left", "right"]}
      >
        <View className="flex-row items-center justify-between px-4 py-3">
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              router.back();
            }}
          >
            <Ionicons name="arrow-back" size={28} color="#128C7E" />
          </TouchableOpacity>
          <Image
            source={require("../../assets/images/nexaLogo.png")}
            style={{
              width: 46,
              height: 46,
              opacity: 0.5,
              tintColor: "#128C7E",
            }}
            resizeMode="contain"
          />
        </View>

        <Animated.View
          className="flex-1 justify-center px-8"
          style={{ transform: [{ translateY }] }}
        >
          <MotiView
            from={{ opacity: 0, translateY: 30 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{
              type: "spring",
              stiffness: 90,
              damping: 15,
              delay: 100,
              opacity: { type: "timing", duration: 400, delay: 100 },
            }}
            className="items-center mb-5"
          >
            <Image
              source={require("../../assets/images/welcome_phone.png")}
              className="w-full h-32"
              resizeMode="contain"
            />
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 24 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{
              type: "spring",
              stiffness: 90,
              damping: 15,
              delay: 210,
              opacity: { type: "timing", duration: 400, delay: 210 },
            }}
          >
            <Text className="text-4xl font-black text-nexa italic">
              {isNewUser ? t("auth.create_account") : t("auth.connection")}
            </Text>
            <Text className="text-2xl font-medium italic text-nexa mb-4">
              {isNewUser ? t("auth.enter_info") : t("auth.enter_phone")}
            </Text>
          </MotiView>

          {isNewUser && (
            <View className="mb-4 mt-4">
              <TextInput
                className={`border rounded-xl px-4 py-3 text-xl ${nameError ? "border-red-400" : "border-gray-300"}`}
                placeholder={t("auth.first_name_placeholder")}
                placeholderTextColor="#6B7280"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  clearError("name");
                }}
                autoFocus
                returnKeyType="next"
              />
              {nameError ? (
                <Text className="text-red-500 text-sm mt-1 ml-1">
                  {nameError}
                </Text>
              ) : null}
            </View>
          )}

          <View className="mb-6">
            <View className="flex-row">
              <CountryPicker selected={country} onSelect={setCountry} />
              <TextInput
                className={`flex-1 border rounded-xl px-4 py-3 text-xl ${phoneError ? "border-red-400" : "border-gray-300"}`}
                placeholder="6 00 00 00 00"
                placeholderTextColor="#6B7280"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  clearError("phone");
                }}
                autoFocus={!isNewUser}
              />
            </View>
            {phoneError ? (
              <Text className="text-red-500 text-sm mt-1 ml-1">
                {phoneError}
              </Text>
            ) : null}
          </View>

          {serverError ? (
            <Text className="text-red-500 text-sm text-center mb-3">
              {serverError}
            </Text>
          ) : null}

          {isNewUser && (
            <TouchableOpacity
              className="flex-row items-start mb-5 px-1"
              activeOpacity={0.7}
              onPress={() => setAccepted((v) => !v)}
            >
              <Ionicons
                name={accepted ? "checkbox" : "square-outline"}
                size={24}
                color={accepted ? "#128C7E" : "#9CA3AF"}
              />
              <Text className="ml-2 flex-1 text-base text-gray-600 leading-6">
                {(() => {
                  const parts = t("auth.consent").split("{{link}}");
                  return (
                    <>
                      {parts[0]}
                      <Text
                        className="text-nexa font-semibold underline"
                        onPress={() => Linking.openURL(PRIVACY_URL)}
                      >
                        {t("auth.privacy_link")}
                      </Text>
                      {parts[1]}
                    </>
                  );
                })()}
              </Text>
            </TouchableOpacity>
          )}

          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TouchableOpacity
              className={`rounded-[2rem] py-6 items-center ${
                buttonError
                  ? "bg-red-500"
                  : isNewUser && !accepted
                    ? "bg-gray-200"
                    : "bg-nexa"
              }`}
              onPress={handleSend}
              disabled={loading || (isNewUser && !accepted)}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className={`font-semibold text-2xl italic ${
                    isNewUser && !accepted ? "text-gray-400" : "text-white"
                  }`}
                >
                  {t("auth.receive_code")} →
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
