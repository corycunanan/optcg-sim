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

export const COLOR_DOT_CLASSES: Readonly<
  Record<(typeof COLORS)[number], string>
> = {
  Red: "bg-card-red",
  Blue: "bg-card-blue",
  Green: "bg-card-green",
  Purple: "bg-card-purple",
  Black: "bg-card-black",
  Yellow: "bg-card-yellow",
};
