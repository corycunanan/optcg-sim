import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const groupBy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { cardSet: { groupBy } },
}));

// `next/link` renders a plain anchor here so the tile's class string is what
// the assertion reads, without pulling in the router.
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

import { SetBrowser } from "./set-browser";

beforeEach(() => {
  groupBy.mockReset();
  groupBy.mockResolvedValue([
    {
      setLabel: "OP01",
      setName: "Romance Dawn",
      packId: "569001",
      _count: { cardId: 121 },
    },
  ]);
});

async function renderBrowser() {
  return renderToStaticMarkup(await SetBrowser({ cardsRoute: "/cards" }));
}

describe("SetBrowser", () => {
  it("rests at shadow-sm and steps to shadow-md on hover", async () => {
    const html = await renderBrowser();

    expect(html).toContain("shadow-sm");
    expect(html).toContain("hover:shadow-md");
  });

  it("takes the standardized 2px lift instead of the old 1px translate", async () => {
    const html = await renderBrowser();

    expect(html).toContain("motion-safe:hover:lift");
    expect(html).not.toContain("hover:-translate-y-px");
  });

  it("transitions the lift and the cast together", async () => {
    const html = await renderBrowser();

    expect(html).toContain("transition-[translate,box-shadow]");
    expect(html).not.toContain("transition-all");
  });
});
