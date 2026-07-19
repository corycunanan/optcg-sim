import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_UNAVAILABLE_ALERT_MESSAGE } from "@/lib/auth-configuration";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signIn: mocks.signIn }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiGet: mocks.apiGet,
    apiPost: mocks.apiPost,
  };
});

import { CredentialsForm } from "./credentials-form";
import { GoogleSignInButton } from "./google-sign-in-button";

function expectUnavailableAlert(renderer: ReactTestRenderer) {
  const alert = renderer.root.findByProps({ role: "alert" });
  expect(alert.children).toContain(AUTH_UNAVAILABLE_ALERT_MESSAGE);
}

describe("stale login page auth degradation", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mocks.signIn.mockReset();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  it("renders the unavailable alert when credentials sign-in receives a 503", async () => {
    mocks.signIn.mockResolvedValue({ status: 503, ok: false, url: null });

    await act(async () => {
      renderer = create(<CredentialsForm callbackUrl="/decks" />);
    });

    await act(async () => {
      await renderer!.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn(),
      });
    });

    expectUnavailableAlert(renderer!);
  });

  it("renders the unavailable alert instead of navigating to Google auth JSON", async () => {
    mocks.apiGet.mockResolvedValue({ csrfToken: "csrf-test-token" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: "Authentication is temporarily unavailable." },
            { status: 503 }
          )
        )
    );

    await act(async () => {
      renderer = create(<GoogleSignInButton callbackUrl="/decks" />);
    });

    await act(async () => {
      await renderer!.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn(),
      });
    });

    expectUnavailableAlert(renderer!);
  });
});
