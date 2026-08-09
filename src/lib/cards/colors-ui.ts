export const COLORS = [
  "Red",
  "Blue",
  "Green",
  "Purple",
  "Black",
  "Yellow",
] as const;

export const COLOR_BG: Readonly<Record<(typeof COLORS)[number], string>> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};
