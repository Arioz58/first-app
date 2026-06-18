import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { MotiImage, MotiText, MotiView } from "moti";
import { useTranslation } from "react-i18next";
import { Image, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function IntroScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView
      className="flex-1 bg-white gap-10"
      edges={["bottom", "left", "right"]}
    >
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#128C7E" />
        </TouchableOpacity>
        <Image
          source={require("../../assets/images/nexaLogo.png")}
          style={{ width: 46, height: 46, opacity: 0.5, tintColor: "#128C7E" }}
          resizeMode="contain"
        />
      </View>

      <MotiView
        className="px-8 mx-6"
        from={{ opacity: 0, translateY: 30 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          type: "spring",
          stiffness: 90,
          damping: 15,
          delay: 80,
          opacity: { type: "timing", duration: 400, delay: 80 },
        }}
      >
        <MotiText
          className="text-6xl font-black text-nexa italic"
          from={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 15,
            delay: 120,
            opacity: { type: "timing", duration: 400, delay: 120 },
          }}
        >
          {t("onboarding.intro_title")}
        </MotiText>

        <MotiText
          className="text-3xl font-medium italic text-nexa"
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 15,
            delay: 230,
            opacity: { type: "timing", duration: 400, delay: 230 },
          }}
        >
          {t("onboarding.intro_subtitle")}
        </MotiText>
      </MotiView>

      <MotiView
        className="items-center"
        from={{ opacity: 0, translateY: 40 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          type: "spring",
          stiffness: 80,
          damping: 14,
          delay: 320,
          opacity: { type: "timing", duration: 500, delay: 320 },
        }}
      >
        <MotiImage
          source={require("../../assets/images/welcome_conversation.png")}
          className="w-full h-52"
          resizeMode="contain"
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 400, delay: 380 }}
        />
      </MotiView>

      <MotiView
        className="px-8 pb-12 gap-4"
        from={{ opacity: 0, translateY: 30 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          type: "spring",
          stiffness: 90,
          damping: 15,
          delay: 440,
          opacity: { type: "timing", duration: 400, delay: 440 },
        }}
      >
        <TouchableOpacity
          className="bg-nexa rounded-[2rem] py-6 items-center"
          onPress={() =>
            router.push({
              pathname: "/(auth)/login" as any,
              params: { isNew: "1" },
            })
          }
        >
          <MotiText
            className="text-white font-semibold text-2xl italic"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300, delay: 560 }}
          >
            {t("onboarding.start")} →
          </MotiText>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-transparent border-nexa border-2 rounded-[2rem] py-6 items-center"
          onPress={() =>
            router.push({
              pathname: "/(auth)/login" as any,
              params: { isNew: "0" },
            })
          }
        >
          <MotiText
            className="text-nexa italic font-semibold text-2xl"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300, delay: 630 }}
          >
            {t("onboarding.have_account")} →
          </MotiText>
        </TouchableOpacity>
      </MotiView>
    </SafeAreaView>
  );
}
