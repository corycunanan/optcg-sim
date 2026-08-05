import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () =>
      mocks.cookieValue === undefined
        ? undefined
        : { value: mocks.cookieValue },
  })),
}));

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "test-font" });
  return {
    Geist: font,
    Geist_Mono: font,
  };
});

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "test-display-font" }),
}));

vi.mock("@/lib/theme", () => ({
  THEME_COOKIE_NAME: "optcg-theme",
  resolveThemeName: (value: unknown) =>
    value === "fixture-theme" ? "fixture-theme" : "default",
  themeDataAttribute: (theme: string) =>
    theme === "default" ? undefined : theme,
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/theme/theme-reconciler", () => ({
  ThemeReconciler: () => null,
}));
vi.mock("@/components/realtime/user-channel-provider", () => ({
  UserChannelProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/deck-builder/deck-navigation-guard", () => ({
  DeckNavigationGuardProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/nav/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));
vi.mock("@/components/social/social-shell", () => ({
  SocialShell: () => <aside data-testid="social-shell" />,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

const { default: RootLayout } = await import("./layout");

beforeEach(() => {
  mocks.cookieValue = undefined;
});

describe("RootLayout theme stamping", () => {
  it("stamps a registered non-default cookie into the SSR html element", async () => {
    mocks.cookieValue = "fixture-theme";

    const html = renderToStaticMarkup(
      await RootLayout({ children: <div>content</div> })
    );

    expect(html).toContain('<html lang="en" data-theme="fixture-theme">');
  });

  it("omits data-theme for the default theme", async () => {
    mocks.cookieValue = "default";

    const html = renderToStaticMarkup(
      await RootLayout({ children: <div>content</div> })
    );

    expect(html).toContain('<html lang="en">');
    expect(html).not.toContain("data-theme=");
  });
});

describe("RootLayout shell geometry", () => {
  it("renders the navbar above the shared content and social row", async () => {
    const html = renderToStaticMarkup(
      await RootLayout({ children: <div>content</div> })
    );

    const navbarIndex = html.indexOf('data-testid="navbar"');
    const contentRowIndex = html.indexOf('data-slot="app-content-row"');
    const socialShellIndex = html.indexOf('data-testid="social-shell"');

    expect(navbarIndex).toBeGreaterThan(-1);
    expect(contentRowIndex).toBeGreaterThan(navbarIndex);
    expect(socialShellIndex).toBeGreaterThan(contentRowIndex);
  });
});
