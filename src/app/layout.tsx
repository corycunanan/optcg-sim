import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Navbar } from "@/components/nav/navbar";
import { SocialShell } from "@/components/social/social-shell";
import { UserChannelProvider } from "@/components/realtime/user-channel-provider";
import { Toaster } from "@/components/ui/sonner";
import { DeckNavigationGuardProvider } from "@/components/deck-builder/deck-navigation-guard";
import "./globals.css";

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
      path: "./fonts/Erode-Variable.woff2",
      weight: "300 700",
      style: "normal",
    },
    {
      path: "./fonts/Erode-VariableItalic.woff2",
      weight: "300 700",
      style: "italic",
    },
  ],
  variable: "--font-erode",
  display: "swap",
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
        className={`${geistSans.variable} ${geistMono.variable} ${erode.variable} antialiased`}
      >
        <SessionProvider>
          <UserChannelProvider>
            <DeckNavigationGuardProvider>
              <SidebarProvider>
                <div className="flex h-screen w-full overflow-hidden">
                  {/* Left column: navbar + content */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Navbar />
                    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      {children}
                    </main>
                  </div>
                  {/* Right column: sidebar (full viewport height) */}
                  <SocialShell />
                </div>
              </SidebarProvider>
            </DeckNavigationGuardProvider>
          </UserChannelProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
