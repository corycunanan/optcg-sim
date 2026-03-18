import type { Metadata } from "next";
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { SocialShell } from "@/components/social/social-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "OPTCG Simulator",
  description:
    "One Piece Trading Card Game simulator — deck builder, game engine, and card database.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} antialiased`}
      >
        <SessionProvider>
          <div className="flex min-h-screen">
            <main className="min-w-0 flex-1">{children}</main>
            <SocialShell />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
