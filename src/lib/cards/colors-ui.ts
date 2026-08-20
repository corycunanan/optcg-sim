export const COLORS = [
  "Red",
  "Blue",
  "Green",
  "Purple",
  "Black",
  "Yellow",
] as const;

export type CardColorName = (typeof COLORS)[number];

/**
 * Solid fill for a color chip that is *selected*. The card palette is a
 * non-themable feature contract and is exempt from the chroma reservation, so a
 * selected chip becomes the color it stands for. These class maps are the sole
 * owner of card-color fills, keyed off the one-step-brighter `--card-*-border`
 * keyline so a dark fill still reads as a shape against navy.
 */
export const COLOR_CHIP_SELECTED_CLASSES: Readonly<
  Record<CardColorName, string>
> = {
  Red: "border-card-red-border bg-card-red text-content-inverse",
  Blue: "border-card-blue-border bg-card-blue text-content-inverse",
  Green: "border-card-green-border bg-card-green text-content-inverse",
  Purple: "border-card-purple-border bg-card-purple text-content-inverse",
  Black: "border-card-black-border bg-card-black text-content-inverse",
  Yellow: "border-card-yellow-border bg-card-yellow text-card-yellow-fg",
};

/**
 * The 12px swatch inside a chip: the card color, ringed by the same-hue
 * `--card-*-border` keyline. The keyline is what keeps Black and Purple from
 * dissolving into the navy surface they sit on.
 */
export const COLOR_SWATCH_CLASSES: Readonly<Record<CardColorName, string>> = {
  Red: "border-card-red-border bg-card-red",
  Blue: "border-card-blue-border bg-card-blue",
  Green: "border-card-green-border bg-card-green",
  Purple: "border-card-purple-border bg-card-purple",
  Black: "border-card-black-border bg-card-black",
  Yellow: "border-card-yellow-border bg-card-yellow",
};
