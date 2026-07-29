import { describe, expect, it } from "vitest";
import {
  isActionableNotification,
  limitNotificationInbox,
  orderNotifications,
} from "./notification-order";

function notification(
  id: string,
  createdAt: string,
  overrides: Partial<{
    type: string;
    status: string;
    referenceId: string | null;
  }> = {}
) {
  return {
    id,
    createdAt,
    type: "FRIEND_REQUEST",
    status: "PENDING",
    referenceId: `request-${id}`,
    ...overrides,
  };
}

describe("notification ordering", () => {
  it("defines actionability from type, pending status, and a reference", () => {
    expect(
      isActionableNotification(notification("actionable", "2026-01-01"))
    ).toBe(true);
    expect(
      isActionableNotification(
        notification("read", "2026-01-01", { status: "READ" })
      )
    ).toBe(true);
    expect(
      isActionableNotification(
        notification("resolved", "2026-01-01", { status: "ACCEPTED" })
      )
    ).toBe(false);
    expect(
      isActionableNotification(
        notification("missing", "2026-01-01", { referenceId: null })
      )
    ).toBe(false);
    expect(
      isActionableNotification(
        notification("other", "2026-01-01", { type: "OTHER" })
      )
    ).toBe(false);
  });

  it("puts actionable rows first and preserves newest-first order per group", () => {
    const rows = [
      notification("resolved-old", "2026-01-02", { status: "ACCEPTED" }),
      notification("actionable-old", "2026-01-01"),
      notification("resolved-new", "2026-01-04", { status: "DECLINED" }),
      notification("actionable-new", "2026-01-03"),
    ];

    expect(orderNotifications(rows).map(({ id }) => id)).toEqual([
      "actionable-new",
      "actionable-old",
      "resolved-new",
      "resolved-old",
    ]);
  });

  it("keeps every actionable row when their count exceeds the normal cap", () => {
    const rows = Array.from({ length: 22 }, (_, index) =>
      notification(`actionable-${index}`, `2026-01-${index + 1}`)
    );
    rows.push(notification("resolved", "2026-02-01", { status: "ACCEPTED" }));

    const visible = limitNotificationInbox(rows, 20);

    expect(visible).toHaveLength(22);
    expect(visible.every(isActionableNotification)).toBe(true);
  });
});
