// Presets de fond pour les stories « texte seul » (sans photo/vidéo).
// Stocké en BDD = l'`id` du preset → ajouter un fond ne nécessite aucune migration
// (même principe que les styles de texte dans lib/storyText.ts).
// `colors` à 1 élément = fond uni ; 2+ = dégradé (LinearGradient diagonal).

export type StoryBg = { id: string; colors: string[] };

export const STORY_BACKGROUNDS: StoryBg[] = [
  { id: 'noir', colors: ['#000000'] },
  { id: 'nexa', colors: ['#128C7E'] },
  { id: 'sunset', colors: ['#FF5F6D', '#FFC371'] },
  { id: 'ocean', colors: ['#2193B0', '#6DD5ED'] },
  { id: 'purple', colors: ['#667EEA', '#764BA2'] },
  { id: 'night', colors: ['#0F2027', '#2C5364'] },
  { id: 'peach', colors: ['#ED4264', '#FFEDBC'] },
  { id: 'mint', colors: ['#11998E', '#38EF7D'] },
];

export const DEFAULT_BACKGROUND_ID = STORY_BACKGROUNDS[0].id;

// Résout un id de preset vers ses couleurs ; repli sur le premier preset.
export const resolveBackground = (id?: string | null): string[] =>
  STORY_BACKGROUNDS.find((b) => b.id === id)?.colors ?? STORY_BACKGROUNDS[0].colors;
