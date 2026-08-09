import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
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

const publicSans = localFont({
  src: [
    {
      path: "./fonts/PublicSans-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-public-sans",
  display: "swap",
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
  ],
  variable: "--font-erode",
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
        className={`${publicSans.variable} ${geistMono.variable} ${erode.variable} antialiased`}
      >
        <SessionProvider>
          <ThemeReconciler />
          <UserChannelProvider>
            <DeckNavigationGuardProvider>
              <SidebarProvider>
                <div
                  data-slot="app-shell"
                  className="flex h-screen w-full overflow-hidden"
                >
                  <div
                    data-slot="app-content-column"
                    className="flex min-w-0 flex-1 flex-col"
                  >
                    <Navbar />
                    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      {children}
                    </main>
                  </div>
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
