import { useRouter } from "expo-router";
import { MotiImage, MotiText, MotiView } from "moti";
import { Image, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      edges={["bottom", "left", "right"]}
    >
      <View className="flex-row justify-end px-4 py-3">
        <Image
          source={require("../../assets/images/nexaLogo.png")}
          style={{ width: 46, height: 46, opacity: 0.5, tintColor: "#128C7E" }}
          resizeMode="contain"
        />
      </View>
      <MotiView
        className="flex-1 justify-center px-8 mx-6"
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: "timing", duration: 200 }}
      >
        <MotiText
          className="text-6xl font-black text-nexa italic"
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
          <MotiText className="font-semibold">Bienvenue sur</MotiText> NEXA !
        </MotiText>

        <MotiText
          className="text-3xl font-medium italic text-nexa"
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 15,
            delay: 220,
            opacity: { type: "timing", duration: 400, delay: 220 },
          }}
        >
          La messagerie qui te récompense !
        </MotiText>

        <MotiImage
          source={require("../../assets/images/welcome_gift.png")}
          className="w-full h-52 mt-24"
          resizeMode="contain"
          from={{ opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: "spring",
            stiffness: 80,
            damping: 14,
            delay: 350,
            opacity: { type: "timing", duration: 500, delay: 350 },
          }}
        />
      </MotiView>

      <MotiView
        className="px-8 pb-12"
        from={{ opacity: 0, translateY: 24 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          type: "spring",
          stiffness: 90,
          damping: 16,
          delay: 470,
          opacity: { type: "timing", duration: 400, delay: 470 },
        }}
      >
        <TouchableOpacity
          className="bg-nexa rounded-[2rem] py-6 items-center"
          onPress={() => router.push("/(auth)/security" as any)}
        >
          <MotiText
            className="text-white font-semibold text-2xl italic"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300, delay: 600 }}
          >
            Continuer →
          </MotiText>
        </TouchableOpacity>
      </MotiView>
    </SafeAreaView>
  );
}
