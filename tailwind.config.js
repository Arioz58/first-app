/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Dark mode piloté par le colorScheme NativeWind (setColorScheme) → permet
  // l'override manuel (Système/Clair/Sombre) en plus du réglage système.
  darkMode: "class",
  theme: {
    extend: {
        colors: {
          primary: "#1E40AF",
          nexa: "#1E40AF",
        },
        // ⚠️ PAS d'override global de fontSize. Essayé plusieurs fois (25-26 juil.
        // 2026) : ça casse l'onboarding (Moti + composants partagés + cache
        // NativeWind récalcitrant). L'agrandissement in-app se fait ÉCRAN PAR
        // ÉCRAN (classes text-* montées d'un cran), jamais globalement.
      },
    },
  plugins: [],
}