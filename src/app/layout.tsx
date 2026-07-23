import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, DM_Serif_Display } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Navbar } from "@/components/nav/navbar";
import { SocialShell } from "@/components/social/social-shell";
import { UserChannelProvider } from "@/components/realtime/user-channel-provider";
import { Toaster } from "@/components/ui/sonner";
import { DeckNavigationGuardProvider } from "@/components/deck-builder/deck-navigation-guard";
import { ThemeReconciler } from "@/components/theme/theme-reconciler";
import {
  THEME_COOKIE_NAME,
  resolveThemeName,
  themeDataAttribute,
} from "@/lib/theme";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "OPTCG Simulator",
  description:
    "One Piece Trading Card Game simulator — deck builder, game engine, and card database.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = resolveThemeName(cookieStore.get(THEME_COOKIE_NAME)?.value);

  return (
    <html lang="en" data-theme={themeDataAttribute(theme)}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSerifDisplay.variable} antialiased`}
      >
        <SessionProvider>
          <ThemeReconciler />
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
