import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function IntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 gap-10 bg-white">
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#128C7E" />
        </TouchableOpacity>
      </View>

      <View className="px-8 mx-6 py-8">
        <Text className="text-6xl font-black text-nexa italic">Discute !</Text>
        <Text className="text-3xl font-medium italic text-nexa">
          Parle librement. Chaque message est chiffré, rien n'est lu.
        </Text>
      </View>

      <View className="items-center">
        <Image
          source={require("../../assets/images/welcome_conversation.png")}
          className="w-full h-52"
          resizeMode="contain"
        />
      </View>

      <View className="px-8 pb-12 gap-4">
        <TouchableOpacity
          className="bg-nexa rounded-[2rem] py-6 items-center"
          onPress={() =>
            router.push({
              pathname: "/(auth)/login" as any,
              params: { isNew: "1" },
            })
          }
        >
          <Text className="text-white font-semibold text-2xl italic">
            Commencer →
          </Text>
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
          <Text className="text-nexa italic font-semibold text-2xl">
            J'ai déjà un compte →
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
