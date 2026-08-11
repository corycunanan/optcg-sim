// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      count: async () => 125,
      groupBy: async ({ by }: { by: string[] }) =>
        by[0] === "type"
          ? [{ type: "Leader", _count: 12 }]
          : [{ blockNumber: 1, _count: 60 }],
    },
    artVariant: { count: async () => 8 },
    cardSet: { findMany: async () => [{ setLabel: "OP01" }] },
  },
}));

const AdminPage = (await import("./page")).default;

afterEach(cleanup);

describe("admin dashboard header", () => {
  it("renders the shared PageHeader rather than a hand-rolled title", async () => {
    const { container } = render(await AdminPage());

    const header = container.querySelector("header");

    expect(header).not.toBeNull();
    expect(header!.className).toContain("max-w-7xl");
    expect(header!.className).toContain("px-6");
    // Top padding only — the well below owns the whole header→content gap.
    expect(header!.className).toContain("pt-8");
    expect(header!.className).not.toMatch(/(?:^|\s)p[by]-/);
    expect(header!.className).not.toContain("border-b");
    expect(header!.className).not.toContain("bg-navy-900");

    const title = container.querySelector("h1")!;
    expect(title.textContent).toBe("Dashboard");
    expect(title.className).toContain("text-content-primary");

    // The content well's top padding equals the header's top padding, which is
    // the measured equality the header rhythm depends on.
    const well = header!.nextElementSibling!;
    expect(well.className).toContain("py-8");
    expect(well.className).toContain("max-w-7xl");
    expect(well.className).toContain("px-6");
  });
});
