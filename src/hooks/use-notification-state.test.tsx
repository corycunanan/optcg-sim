import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectionStatus,
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
type NotificationUpdatedEvent = Extract<
  RealtimeServerEvent,
  { type: "notification:updated" }
>;
type NotificationReadAllEvent = Extract<
  RealtimeServerEvent,
  { type: "notification:read_all" }
>;

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  subscribe: vi.fn(),
  createdHandler: null as ((event: NotificationCreatedEvent) => void) | null,
  resolvedHandler: null as ((event: NotificationResolvedEvent) => void) | null,
  updatedHandler: null as ((event: NotificationUpdatedEvent) => void) | null,
  readAllHandler: null as ((event: NotificationReadAllEvent) => void) | null,
  visibilityHandler: null as (() => void) | null,
  unsubscribeCreated: vi.fn(),
  unsubscribeResolved: vi.fn(),
  unsubscribeUpdated: vi.fn(),
  unsubscribeReadAll: vi.fn(),
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
let stateEffectCalls = 0;

function notification(
  status: SerializedNotification["status"] = "PENDING",
  id = "notification-1",
  overrides: Partial<SerializedNotification> = {}
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
    ...overrides,
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

function Probe({
  enabled = true,
  connectionStatus = "connected",
}: {
  enabled?: boolean;
  connectionStatus?: ConnectionStatus;
}) {
  const state = useNotificationState(
    mocks.subscribe,
    enabled,
    connectionStatus
  );
  useEffect(() => {
    latest = state;
    stateEffectCalls += 1;
  }, [state]);
  return null;
}

async function mount(
  enabled = true,
  connectionStatus: ConnectionStatus = "connected"
) {
  await act(async () => {
    renderer = create(
      <Probe enabled={enabled} connectionStatus={connectionStatus} />
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function rerender(connectionStatus: ConnectionStatus) {
  await act(async () => {
    renderer?.update(<Probe connectionStatus={connectionStatus} />);
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
  mocks.updatedHandler = null;
  mocks.readAllHandler = null;
  mocks.visibilityHandler = null;
  mocks.unsubscribeCreated.mockReset();
  mocks.unsubscribeResolved.mockReset();
  mocks.unsubscribeUpdated.mockReset();
  mocks.unsubscribeReadAll.mockReset();
  mocks.subscribe.mockImplementation((type: string, handler: never) => {
    if (type === "notification:created") mocks.createdHandler = handler;
    if (type === "notification:resolved") mocks.resolvedHandler = handler;
    if (type === "notification:updated") mocks.updatedHandler = handler;
    if (type === "notification:read_all") mocks.readAllHandler = handler;
    if (type === "notification:created") return mocks.unsubscribeCreated;
    if (type === "notification:resolved") return mocks.unsubscribeResolved;
    if (type === "notification:updated") return mocks.unsubscribeUpdated;
    return mocks.unsubscribeReadAll;
  });
  latest = null;
  renderer = null;
  stateEffectCalls = 0;
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

    mocks.apiGet.mockResolvedValueOnce(response([notification()], 1));
    await act(async () => {
      mocks.createdHandler?.({
        type: "notification:created",
        notification: notification(),
        unreadCount: 1,
      });
    });
    expect(latest?.unreadCount).toBe(1);
    expect(latest?.notifications).toEqual([notification()]);

    mocks.apiGet.mockResolvedValueOnce(response([notification("ACCEPTED")], 0));
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

  it("orders a local merge identically to a server refetch of the same rows", async () => {
    const resolved = Array.from({ length: 20 }, (_, index) =>
      notification("ACCEPTED", `resolved-${index}`, {
        createdAt: new Date(Date.UTC(2026, 0, index + 2)).toISOString(),
      })
    );
    const oldActionable = notification("PENDING", "old-actionable", {
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const serverRows = [
      oldActionable,
      ...resolved.slice().reverse().slice(0, 19),
    ];
    mocks.apiGet
      .mockResolvedValueOnce(response(resolved.slice().reverse(), 0))
      .mockResolvedValueOnce(response(serverRows, 1));
    await mount();

    await act(async () => {
      mocks.createdHandler?.({
        type: "notification:created",
        notification: oldActionable,
        unreadCount: 1,
      });
    });
    const locallyMergedIds = latest?.notifications.map(({ id }) => id);

    await act(async () => {
      mocks.visibilityHandler?.();
      await Promise.resolve();
    });

    expect(locallyMergedIds).toEqual(serverRows.map(({ id }) => id));
    expect(latest?.notifications.map(({ id }) => id)).toEqual(locallyMergedIds);
  });

  it("applies read/dismiss and mark-all-read changes across tabs", async () => {
    const pending = [notification(), notification("PENDING", "notification-2")];
    mocks.apiGet.mockResolvedValueOnce(response(pending, 2));
    await mount();

    const dismissed = [
      notification("DISMISSED"),
      notification("PENDING", "notification-2"),
    ];
    mocks.apiGet.mockResolvedValueOnce(response(dismissed, 1));
    await act(async () => {
      mocks.updatedHandler?.({
        type: "notification:updated",
        notification: notification("DISMISSED"),
        unreadCount: 1,
      });
      await Promise.resolve();
    });
    expect(
      latest?.notifications.find(({ id }) => id === "notification-1")?.status
    ).toBe("DISMISSED");
    expect(latest?.unreadCount).toBe(1);

    const allRead = [
      notification("DISMISSED"),
      notification("READ", "notification-2"),
    ];
    mocks.apiGet.mockResolvedValueOnce(response(allRead, 0));
    await act(async () => {
      mocks.readAllHandler?.({
        type: "notification:read_all",
        unreadCount: 0,
      });
      await Promise.resolve();
    });
    expect(latest?.notifications.map(({ status }) => status)).toEqual([
      "READ",
      "DISMISSED",
    ]);
    expect(latest?.unreadCount).toBe(0);
  });

  it("reconciles once when a disconnected channel reconnects", async () => {
    mocks.apiGet
      .mockResolvedValueOnce(response([notification()], 1))
      .mockResolvedValueOnce(response([notification("ACCEPTED")], 0));
    await mount(true, "connected");

    await rerender("disconnected");
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);

    await rerender("connected");
    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
    expect(latest?.notifications[0].status).toBe("ACCEPTED");
    expect(latest?.unreadCount).toBe(0);

    await rerender("connected");
    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
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
    mocks.apiGet
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      )
      .mockResolvedValueOnce(response([notification()], 1));

    await mount();
    await act(async () => {
      mocks.createdHandler?.({
        type: "notification:created",
        notification: notification(),
        unreadCount: 1,
      });
      await Promise.resolve();
    });
    await act(async () => {
      resolveFetch(response([], 0));
      await Promise.resolve();
    });

    expect(latest?.notifications).toEqual([notification()]);
    expect(latest?.unreadCount).toBe(1);
  });

  it("converges after concurrent stale counts are delivered", async () => {
    const pending = [notification(), notification("PENDING", "notification-2")];
    mocks.apiGet.mockResolvedValueOnce(response(pending, 2));
    await mount();

    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    let resolveSecond!: (value: ReturnType<typeof response>) => void;
    mocks.apiGet
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
      );

    await act(async () => {
      mocks.resolvedHandler?.({
        type: "notification:resolved",
        notification: notification("ACCEPTED"),
        unreadCount: 1,
      });
      mocks.resolvedHandler?.({
        type: "notification:resolved",
        notification: notification("ACCEPTED", "notification-2"),
        unreadCount: 1,
      });
    });
    expect(latest?.unreadCount).toBe(1);

    const committed = [
      notification("ACCEPTED"),
      notification("ACCEPTED", "notification-2"),
    ];
    await act(async () => {
      resolveSecond(response(committed, 0));
      await Promise.resolve();
    });
    await act(async () => {
      resolveFirst(response([notification("ACCEPTED"), pending[1]], 1));
      await Promise.resolve();
    });

    expect(latest?.unreadCount).toBe(0);
    expect(latest?.notifications.map(({ status }) => status)).toEqual([
      "ACCEPTED",
      "ACCEPTED",
    ]);
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

  it("unsubscribes every notification event and visibility listener on unmount", async () => {
    mocks.apiGet.mockResolvedValue(response([], 0));
    await mount();
    const visibilityHandler = mocks.visibilityHandler;

    await act(async () => renderer?.unmount());
    renderer = null;

    expect(mocks.unsubscribeCreated).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribeResolved).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribeUpdated).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribeReadAll).toHaveBeenCalledTimes(1);
    expect(document.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      visibilityHandler
    );
  });

  it("aborts reconciliation and does not publish state after unmount", async () => {
    let resolveFetch!: (value: ReturnType<typeof response>) => void;
    mocks.apiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    await mount();
    const signal = mocks.apiGet.mock.calls[0][2].signal as AbortSignal;

    await act(async () => renderer?.unmount());
    renderer = null;
    const callsAfterUnmount = stateEffectCalls;
    expect(signal.aborted).toBe(true);

    await act(async () => {
      resolveFetch(response([notification()], 1));
      await Promise.resolve();
    });

    expect(stateEffectCalls).toBe(callsAfterUnmount);
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
