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
        // Pas d'override de fontSize : la police reste à l'échelle Tailwind
        // d'origine partout. L'agrandissement « +1 cran » n'a été gardé que
        // sur les AVATARS/éléments (agrandir la police seule cassait les
        // proportions — le texte grossit mais pas les paddings/hauteurs).
      },
    },
  plugins: [],
}