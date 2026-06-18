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
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiRequest } from "../../lib/api";
import { registerForPushNotifications } from "../../lib/notifications";
import { connectSocket } from "../../lib/socket";
import { saveTokens } from "../../lib/storage";

const OTP_DURATION = 5 * 60; // 5 minutes en secondes

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VerifyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { phone, name } = useLocalSearchParams<{
    phone: string;
    name: string;
  }>();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(OTP_DURATION);
  const [error, setError] = useState("");
  const inputRefs = useRef<Array<TextInput | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  const translateY = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(OTP_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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
    setError("");
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
      setError(t("auth.wrong_code"));
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await apiRequest("/auth/send-code", {
        method: "POST",
        body: { phone },
        auth: false,
      });
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      startTimer();
    } catch (e: any) {
      setError(t("auth.resend_failed"));
    } finally {
      setResending(false);
    }
  };

  const code = digits.join("");
  const expired = timeLeft === 0;

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
          >
            <Text className="text-5xl font-black text-nexa italic">
              {t("auth.verification")}
            </Text>
            <Text className="text-2xl font-medium italic text-nexa mb-6">
              {t("auth.code_sent_to", { phone })}
            </Text>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 40 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{
              type: "spring",
              stiffness: 80,
              damping: 14,
              delay: 220,
              opacity: { type: "timing", duration: 500, delay: 220 },
            }}
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
            transition={{
              type: "spring",
              stiffness: 90,
              damping: 15,
              delay: 330,
              opacity: { type: "timing", duration: 400, delay: 330 },
            }}
            className="flex-row justify-between mb-4"
          >
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                className={`w-14 h-16 border-2 rounded-2xl text-center text-3xl font-bold ${
                  expired
                    ? "border-gray-200 text-gray-300"
                    : digit
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
                editable={!expired}
              />
            ))}
          </MotiView>

          {error ? (
            <MotiView
              from={{ opacity: 0, translateY: -6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 300 }}
              className="mb-4"
            >
              <Text className="text-red-500 text-center font-medium text-base">
                {error}
              </Text>
            </MotiView>
          ) : null}

          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 400, delay: 400 }}
            className="items-center mb-6"
          >
            {expired ? (
              <TouchableOpacity onPress={handleResend} disabled={resending}>
                {resending ? (
                  <ActivityIndicator color="#128C7E" />
                ) : (
                  <Text className="text-nexa font-semibold text-base">
                    {t("auth.resend_code")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text
                className={`text-base font-medium ${timeLeft <= 30 ? "text-red-400" : "text-gray-400"}`}
              >
                {t("auth.code_valid_for")}{" "}
                <Text className="font-bold">{formatTime(timeLeft)}</Text>
              </Text>
            )}
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 500, delay: 450 }}
          >
            <TouchableOpacity
              className={`rounded-[2rem] py-6 items-center ${code.length === 6 && !expired ? "bg-nexa" : "bg-gray-200"}`}
              onPress={handleVerify}
              disabled={loading || code.length < 6 || expired}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className={`font-semibold text-2xl italic ${code.length === 6 && !expired ? "text-white" : "text-gray-400"}`}
                >
                  {t("auth.confirm")} →
                </Text>
              )}
            </TouchableOpacity>
          </MotiView>
        </Animated.View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
