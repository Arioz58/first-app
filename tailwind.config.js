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
        // Échelle typo agrandie (~+1px par palier). ⚠️ Les écrans d'inscription
        // app/(auth)/* sont EXEMPTÉS : ils figent leurs tailles en style inline
        // (fontSize + lineHeight d'origine), donc cet override ne les touche pas.
        // Ne PAS remettre de classe text-* dans (auth) — utiliser l'inline.
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