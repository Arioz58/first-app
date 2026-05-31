import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StepIndicator from "../../components/StepIndicator";

function getStep(pathname: string): number {
  if (pathname.includes("intro")) return 2;
  if (pathname.includes("login")) return 3;
  if (pathname.includes("verify")) return 4;
  return 1; // welcome
}

function AuthHeader() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const step = getStep(pathname);

  return (
    <View style={{ paddingTop: insets.top }}>
      <StepIndicator currentStep={step} />
    </View>
  );
}

export default function AuthLayout() {
  return (
    <>
      <AuthHeader />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 300,
        }}
      />
    </>
  );
}
