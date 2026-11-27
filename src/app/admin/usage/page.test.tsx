// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/metrics/usage", () => ({
  getUsageSummary: async () => ({
    windowDays: 2,
    since: "2026-11-26",
    days: [
      {
        day: "2026-11-26",
        started: 4,
        finished: 3,
        abandoned: 1,
        activePlayers: 5,
      },
      {
        day: "2026-11-27",
        started: 1,
        finished: 0,
        abandoned: 0,
        activePlayers: 2,
      },
    ],
    totals: {
      started: 5,
      finished: 3,
      abandoned: 1,
      inProgress: 1,
      activePlayers: 6,
    },
    endReasons: [{ reasonCode: "LEADER_KO", count: 3 }],
    modes: [],
  }),
}));

const AdminUsagePage = (await import("./page")).default;

afterEach(cleanup);

describe("admin usage page", () => {
  it("shows totals, newest day first, end reasons and empty states", async () => {
    render(await AdminUsagePage());

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Game usage"
    );
    expect(screen.getByText(/since 2026-11-26/)).toBeTruthy();

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      "2026-11-27",
      "2026-11-26",
    ]);
    expect(screen.getByText("LEADER_KO")).toBeTruthy();
    expect(screen.getByText("No games started in this window.")).toBeTruthy();
  });
});
