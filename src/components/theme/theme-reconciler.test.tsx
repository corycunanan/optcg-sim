import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  session: {
    data: { user: { theme: "fixture-theme" } },
    status: "authenticated",
  },
  fetch: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.session,
}));

vi.mock("@/lib/theme", () => ({
  resolveThemeName: (value: unknown) =>
    value === "fixture-theme" ? "fixture-theme" : "default",
}));

const { ThemeReconciler } = await import("./theme-reconciler");

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  mocks.session.data.user.theme = "fixture-theme";
  mocks.session.status = "authenticated";
  mocks.fetch.mockReset();
  mocks.reload.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("document", {
    documentElement: { dataset: {} as Record<string, string> },
  });
  vi.stubGlobal("window", { location: { reload: mocks.reload } });
});

afterEach(() => {
  if (renderer) {
    act(() => renderer?.unmount());
    renderer = null;
  }
  vi.unstubAllGlobals();
});

describe("ThemeReconciler", () => {
  it("syncs and reloads once when the DB-backed session differs from SSR", async () => {
    await act(async () => {
      renderer = create(<ThemeReconciler />);
      await Promise.resolve();
    });

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/user/theme",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(mocks.reload).toHaveBeenCalledOnce();
  });

  it("does no reconciliation work when SSR already matches the session", async () => {
    vi.stubGlobal("document", {
      documentElement: {
        dataset: { theme: "fixture-theme" } as Record<string, string>,
      },
    });

    await act(async () => {
      renderer = create(<ThemeReconciler />);
      await Promise.resolve();
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
