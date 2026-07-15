import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  send: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: mocks.subscribe,
    send: mocks.send,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("./user-avatar", () => ({
  UserAvatar: () => null,
}));

import { ChatWidget } from "./chat-widget";

const userA = {
  id: "user-a",
  username: "alpha",
  name: null,
  image: null,
};

const userB = {
  id: "user-b",
  username: "bravo",
  name: null,
  image: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function widget(user: typeof userA) {
  return (
    <ChatWidget
      user={user}
      currentUserId="current-user"
      sidebarCollapsed={false}
      onClose={vi.fn()}
    />
  );
}

describe("ChatWidget recipient changes", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    mocks.apiGet.mockReset();
    mocks.apiGet.mockResolvedValue({ data: [], more: false });
    mocks.apiPost.mockReset();
    mocks.subscribe.mockClear();
    mocks.send.mockReset();
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    vi.unstubAllGlobals();
  });

  it("does not apply a pending send result to a newly selected recipient", async () => {
    const pendingSend = deferred<{
      data: {
        id: string;
        body: string;
        createdAt: string;
        fromUserId: string;
        readAt: null;
      };
    }>();
    mocks.apiPost.mockReturnValueOnce(pendingSend.promise);

    await act(async () => {
      renderer = create(widget(userA));
      await Promise.resolve();
    });

    act(() => {
      renderer?.root.findByType("input").props.onChange({
        target: { value: "message for alpha" },
      });
    });
    act(() => {
      renderer?.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });

    await act(async () => {
      renderer?.update(widget(userB));
      await Promise.resolve();
    });
    expect(renderer?.root.findByType("input").props.disabled).toBe(false);
    act(() => {
      renderer?.root.findByType("input").props.onChange({
        target: { value: "draft for bravo" },
      });
    });

    await act(async () => {
      pendingSend.resolve({
        data: {
          id: "message-a",
          body: "message for alpha",
          createdAt: "2026-07-15T22:00:00.000Z",
          fromUserId: "current-user",
          readAt: null,
        },
      });
      await pendingSend.promise;
    });

    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/messages/user-a",
      { body: "message for alpha" },
      expect.anything()
    );
    expect(renderer?.root.findByType("input").props.value).toBe(
      "draft for bravo"
    );
    expect(renderer?.root.findByType("input").props.disabled).toBe(false);
    expect(JSON.stringify(renderer?.toJSON())).not.toContain(
      "message for alpha"
    );
  });
});
