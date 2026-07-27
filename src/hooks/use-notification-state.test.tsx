import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RealtimeServerEvent,
  SerializedNotification,
} from "@/types/realtime";

type NotificationCreatedEvent = Extract<
  RealtimeServerEvent,
  { type: "notification:created" }
>;
type NotificationResolvedEvent = Extract<
  RealtimeServerEvent,
  { type: "notification:resolved" }
>;

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  subscribe: vi.fn(),
  createdHandler: null as ((event: NotificationCreatedEvent) => void) | null,
  resolvedHandler: null as ((event: NotificationResolvedEvent) => void) | null,
  visibilityHandler: null as (() => void) | null,
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
}));

import {
  applyNotificationEvent,
  useNotificationState,
  type NotificationInboxState,
} from "./use-notification-state";

let latest: NotificationInboxState | null = null;
let renderer: ReactTestRenderer | null = null;

function notification(
  status: SerializedNotification["status"] = "PENDING",
  id = "notification-1"
): SerializedNotification {
  return {
    id,
    userId: "user-recipient",
    type: "FRIEND_REQUEST",
    status,
    actorUserId: "user-sender",
    referenceId: "request-1",
    payload: null,
    createdAt: "2026-07-26T10:00:00.000Z",
    updatedAt: "2026-07-26T10:00:00.000Z",
    actor: {
      id: "user-sender",
      username: "ace",
      name: "Ace",
      image: null,
    },
  };
}

function response(
  notifications: SerializedNotification[],
  unreadCount: number
) {
  return {
    data: {
      notifications,
      unreadCount,
      pagination: {
        total: notifications.length,
        page: 1,
        limit: 20,
        totalPages: notifications.length === 0 ? 0 : 1,
      },
    },
  };
}

function Probe({ enabled = true }: { enabled?: boolean }) {
  const state = useNotificationState(mocks.subscribe, enabled);
  useEffect(() => {
    latest = state;
  }, [state]);
  return null;
}

async function mount(enabled = true) {
  await act(async () => {
    renderer = create(<Probe enabled={enabled} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn((type: string, handler: () => void) => {
      if (type === "visibilitychange") mocks.visibilityHandler = handler;
    }),
    removeEventListener: vi.fn(),
  });
  mocks.apiGet.mockReset();
  mocks.subscribe.mockReset();
  mocks.createdHandler = null;
  mocks.resolvedHandler = null;
  mocks.visibilityHandler = null;
  mocks.subscribe.mockImplementation((type: string, handler: never) => {
    if (type === "notification:created") mocks.createdHandler = handler;
    if (type === "notification:resolved") mocks.resolvedHandler = handler;
    return vi.fn();
  });
  latest = null;
  renderer = null;
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

describe("useNotificationState", () => {
  it("does not fetch or subscribe before authentication is ready", async () => {
    await mount(false);

    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(latest).toMatchObject({
      notifications: [],
      unreadCount: 0,
      loadState: "idle",
    });
  });

  it("updates the unread count and first page from created and resolved events", async () => {
    mocks.apiGet.mockResolvedValue(response([], 0));
    await mount();

    await act(async () => {
      mocks.createdHandler?.({
        type: "notification:created",
        notification: notification(),
        unreadCount: 1,
      });
    });
    expect(latest?.unreadCount).toBe(1);
    expect(latest?.notifications).toEqual([notification()]);

    await act(async () => {
      mocks.resolvedHandler?.({
        type: "notification:resolved",
        notification: notification("ACCEPTED"),
        unreadCount: 0,
      });
    });
    expect(latest?.unreadCount).toBe(0);
    expect(latest?.notifications[0].status).toBe("ACCEPTED");
  });

  it("reconciles a missed resolution when the document becomes visible", async () => {
    mocks.apiGet
      .mockResolvedValueOnce(response([notification()], 1))
      .mockResolvedValueOnce(response([notification("DECLINED")], 0));
    await mount();

    expect(latest?.unreadCount).toBe(1);
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.visibilityHandler?.();
      await Promise.resolve();
    });

    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
    expect(latest?.unreadCount).toBe(0);
    expect(latest?.notifications[0].status).toBe("DECLINED");
  });

  it("replays an event that arrives while reconciliation is in flight", async () => {
    let resolveFetch!: (value: ReturnType<typeof response>) => void;
    mocks.apiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    await mount();
    await act(async () => {
      mocks.createdHandler?.({
        type: "notification:created",
        notification: notification(),
        unreadCount: 1,
      });
      resolveFetch(response([], 0));
      await Promise.resolve();
    });

    expect(latest?.notifications).toEqual([notification()]);
    expect(latest?.unreadCount).toBe(1);
  });

  it("does not let an older reconciliation overwrite a newer one", async () => {
    mocks.apiGet.mockResolvedValueOnce(response([], 0));
    await mount();

    let resolveOlder!: (value: ReturnType<typeof response>) => void;
    let resolveNewer!: (value: ReturnType<typeof response>) => void;
    mocks.apiGet
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNewer = resolve;
        })
      );

    await act(async () => {
      mocks.visibilityHandler?.();
      mocks.visibilityHandler?.();
      resolveNewer(response([notification("DECLINED")], 0));
      await Promise.resolve();
    });
    await act(async () => {
      resolveOlder(response([notification()], 1));
      await Promise.resolve();
    });

    expect(latest?.notifications[0].status).toBe("DECLINED");
    expect(latest?.unreadCount).toBe(0);
  });

  it("does not reconcile while the document remains hidden", async () => {
    mocks.apiGet.mockResolvedValue(response([], 0));
    await mount();
    Object.defineProperty(document, "visibilityState", { value: "hidden" });

    await act(async () => {
      mocks.visibilityHandler?.();
      await Promise.resolve();
    });

    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
  });
});

describe("applyNotificationEvent", () => {
  it("deduplicates a repeated notification:created delivery", () => {
    const event: NotificationCreatedEvent = {
      type: "notification:created",
      notification: notification(),
      unreadCount: 1,
    };
    const once = applyNotificationEvent(
      { notifications: [], unreadCount: 0 },
      event
    );

    expect(applyNotificationEvent(once, event).notifications).toHaveLength(1);
  });

  it("updates the count without appending an unknown resolved notification", () => {
    const next = applyNotificationEvent(
      { notifications: [], unreadCount: 1 },
      {
        type: "notification:resolved",
        notification: notification("ACCEPTED"),
        unreadCount: 0,
      }
    );

    expect(next).toEqual({ notifications: [], unreadCount: 0 });
  });
});
