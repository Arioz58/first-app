import { MotiView } from "moti";
import { Dimensions, View } from "react-native";

const { width } = Dimensions.get("window");
const TOTAL_STEPS = 5;
const GAP = 6;
const PADDING = 16;
const ACTIVE_RATIO = 3;
const usableWidth = width - PADDING * 2;
const inactiveWidth =
  (usableWidth - GAP * (TOTAL_STEPS - 1)) / (TOTAL_STEPS - 1 + ACTIVE_RATIO);
const activeWidth = inactiveWidth * ACTIVE_RATIO;

type Props = {
  currentStep: number;
};

export default function StepIndicator({ currentStep }: Props) {
  return (
    <View style={{ flexDirection: "row", gap: GAP, width, paddingHorizontal: PADDING }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const isActive = i + 1 === currentStep;
        return (
          <MotiView
            key={i}
            animate={{
              width: isActive ? activeWidth : inactiveWidth,
              backgroundColor: isActive ? "#128C7E" : "#D1D5DB",
            }}
            transition={{ type: "spring", stiffness: 180, damping: 20, mass: 1 }}
            style={{ height: 5, borderRadius: 99 }}
          />
        );
      })}
    </View>
  );
}
