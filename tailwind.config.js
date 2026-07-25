/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
        colors: {
          primary: "#1E40AF",
          nexa: "#1E40AF",
        },
        // Échelle typographique légèrement agrandie (25 juil. 2026).
        // ~+1px par palier — un cran plus doux que la 1re version (jugée trop grande),
        // les avatars/éléments restant à leur taille validée. Un seul endroit à régler.
        fontSize: {
          xs: ["13px", "17px"],
          sm: ["15px", "21px"],
          base: ["17px", "24px"],
          lg: ["19px", "26px"],
          xl: ["22px", "28px"],
          "2xl": ["26px", "32px"],
          "3xl": ["32px", "38px"],
          "4xl": ["38px", "44px"],
          "5xl": ["51px", "52px"],
          "6xl": ["63px", "63px"],
        },
      },
    },
  plugins: [],
}