import type { Preview, Decorator } from "@storybook/nextjs-vite";
import { Geist, Geist_Mono, DM_Serif_Display } from "next/font/google";
import "../src/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const withFonts: Decorator = (Story) => (
  <div
    className={`${geistSans.variable} ${geistMono.variable} ${dmSerifDisplay.variable} antialiased font-sans text-content-primary`}
  >
    <Story />
  </div>
);

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "surface-base",
      values: [
        { name: "surface-base", value: "oklch(97% 0.006 75)" },
        { name: "surface-1", value: "oklch(95% 0.007 75)" },
        { name: "game-board", value: "oklch(9% 0.005 245)" },
      ],
    },
  },
  decorators: [withFonts],
};

export default preview;
