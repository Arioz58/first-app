import { useRouter } from "expo-router";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center px-8 mx-6">
        <Text className="text-6xl font-black text-nexa italic">
          <Text className="font-semibold">Bienvenue sur</Text> NEXA !
        </Text>
        <Text className="text-3xl font-medium italic text-nexa">
          La messagerie qui te récompense !
        </Text>
        <Image
          source={require("../../assets/images/welcome_gift.png")}
          className="w-full h-52 mt-24"
          resizeMode="contain"
        />
      </View>

      <View className="px-8 pb-12">
        <TouchableOpacity
          className="bg-nexa rounded-[2rem] py-6 items-center"
          onPress={() => router.push("/(auth)/intro" as any)}
        >
          <Text className="text-white font-semibold text-2xl italic">
            Continuer →
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
