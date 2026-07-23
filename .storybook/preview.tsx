import type { Preview, Decorator } from "@storybook/nextjs-vite";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "../src/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const erode = localFont({
  src: [
    {
      path: "../src/app/fonts/Erode-Variable.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  variable: "--font-erode",
  display: "swap",
});

const withFonts: Decorator = (Story) => (
  <div
    className={`${geistSans.variable} ${geistMono.variable} ${erode.variable} antialiased font-sans text-content-primary`}
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
