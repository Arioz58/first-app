// Emojis proposés comme « stickers » déplaçables dans l'éditeur de story,
// regroupés par catégories (onglets dans l'EmojiPicker).
// Un sticker est stocké dans la liste `texts` (colonne Json) avec kind='sticker'
// → aucune migration backend.

export type StickerCategory = {
  id: string;
  icon: string; // emoji représentant la catégorie (onglet)
  emojis: string[];
};

export const STICKER_CATEGORIES: StickerCategory[] = [
  {
    id: "smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥹", "😊",
      "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😜", "🤪",
      "😎", "🤩", "🥳", "😏", "😒", "🙄", "😔", "😴", "🤤", "😪",
      "😭", "😱", "😡", "🤬", "🤯", "🥶", "🥵", "🤢", "🤮", "🤧",
      "😷", "🤒", "🤠", "🤡", "👻", "💀", "👽", "🤖", "🫠", "🫡",
    ],
  },
  {
    id: "hearts",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "❤️‍🔥",
      "💯", "✨", "⭐", "🌟", "💫", "🔥", "💥", "💦", "💢", "💤",
    ],
  },
  {
    id: "hands",
    icon: "👍",
    emojis: [
      "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤝",
      "🙏", "✌️", "🤞", "🫰", "🤟", "🤘", "👌", "🤌", "🫶", "🫵",
      "💪", "👀", "👁️", "🧠", "👅", "👂", "👃", "🦶", "🦵", "🫦",
    ],
  },
  {
    id: "fun",
    icon: "🎉",
    emojis: [
      "🎉", "🎊", "🎈", "🎁", "🎀", "🏆", "🥇", "👑", "💎", "🎮",
      "🎯", "🎲", "🎵", "🎶", "📸", "💸", "💰", "🚀", "⚡", "🌈",
      "☀️", "🌙", "❄️", "🌸", "🌹", "🌺", "🌻", "🍀", "🌴", "💐",
    ],
  },
  {
    id: "food",
    icon: "🍕",
    emojis: [
      "🍕", "🍔", "🍟", "🌭", "🍿", "🥪", "🌮", "🍣", "🍩", "🍪",
      "🍰", "🎂", "🍫", "🍬", "🍭", "🍦", "🍉", "🍓", "🍌", "🍒",
      "🥑", "☕", "🍵", "🧋", "🥤", "🍺", "🍻", "🥂", "🍷", "🍾",
    ],
  },
  {
    id: "animals",
    icon: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐸", "🐵", "🐧", "🐥", "🦄", "🐝", "🦋", "🐢", "🐙",
      "🦖", "🦕", "🐠", "🐬", "🦈", "🐳", "🦓", "🦒", "🐘", "🦦",
    ],
  },
  {
    id: "travel",
    icon: "✈️",
    emojis: [
      "🚗", "🏎️", "🚕", "🚌", "🏍️", "🚲", "✈️", "🚀", "🛸", "🚁",
      "⛵", "🚤", "🏖️", "🏝️", "⛰️", "🗽", "🗼", "🎡", "🎢", "🏟️",
      "📍", "🧭", "🌍", "🌋", "🔥", "💬", "❓", "❗", "✅", "❌",
    ],
  },
];

// Taille de base d'un sticker (px). DOIT être identique côté éditeur et viewer
// pour que le `scale` (pinch) corresponde des deux côtés.
export const STICKER_FONT_SIZE = 52;
