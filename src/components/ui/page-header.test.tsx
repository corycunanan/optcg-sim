// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "./page-header";

describe("PageHeader", () => {
  it("aligns its inner content to the app-wide container", () => {
    const { getByText } = render(
      <PageHeader>
        <span>Header content</span>
      </PageHeader>
    );

    const content = getByText("Header content").parentElement;

    expect(content?.className.split(/\s+/)).toContain("max-w-7xl");
    expect(content?.className.split(/\s+/)).toContain("px-6");
  });

  it("renders as a banner-less header — no band, no bottom rule", () => {
    const { container } = render(
      <PageHeader>
        <span>Header content</span>
      </PageHeader>
    );

    const header = container.querySelector("header");

    expect(header).not.toBeNull();
    const classes = header!.className.split(/\s+/);
    expect(classes).not.toContain("border-b");
    expect(classes).not.toContain("bg-navy-900");
  });

  it("carries top padding only, so the page's content well owns the whole gap", () => {
    const { container } = render(
      <PageHeader>
        <span>Header content</span>
      </PageHeader>
    );

    const header = container.querySelector("header")!;

    // The equal-rhythm invariant: header top padding == header→content gap.
    // That only holds while the header contributes no bottom padding of its
    // own — a `pb-*`/`py-*` here would double the gap again.
    expect(header.className).toContain("pt-8");
    expect(header.className).not.toMatch(/(?:^|\s)p[by]-/);
  });

  it("lets a page override the vertical step without losing the shared tokens", () => {
    const { container } = render(
      <PageHeader className="pt-4 lg:pt-8" data-lobby-header>
        <span>Header content</span>
      </PageHeader>
    );

    const header = container.querySelector("header")!;

    expect(header.getAttribute("data-lobby-header")).not.toBeNull();
    expect(header.className).toContain("pt-4");
    expect(header.className).toContain("lg:pt-8");
    // tailwind-merge drops the default step rather than emitting both.
    expect(header.className).not.toMatch(/(?:^|\s)pt-8(?:\s|$)/);
    expect(header.className).toContain("px-6");
    expect(header.className).toContain("max-w-7xl");
  });

  it("stacks title above actions on narrow viewports", () => {
    const { container } = render(
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Decks</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <button type="button">Filter</button>
          <button type="button">+ New Deck</button>
        </PageHeaderActions>
      </PageHeader>
    );

    const header = container.querySelector("header")!;

    // A title and a row of nowrap CTAs cannot share 272px of content box at
    // 320px, so the row stacks below `sm` and only pairs up from `sm`.
    expect(header.className).toContain("flex-col");
    expect(header.className).toContain("items-start");
    expect(header.className).toContain("sm:flex-row");
    expect(header.className).toContain("sm:items-center");
    // Stacking must not reintroduce bottom padding — the gap stays single.
    expect(header.className).not.toMatch(/(?:^|\s)p[by]-/);

    // And the CTAs themselves wrap rather than crush each other.
    const actions = header.lastElementChild!;
    expect(actions.className).toContain("flex-wrap");
  });

  it("titles on the page surface rather than an inverted band", () => {
    const { container } = render(
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Game mode</PageHeaderEyebrow>
          <PageHeaderTitle>Standard</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
    );

    const title = container.querySelector("h1")!;

    expect(title.className).toContain("text-content-primary");
    expect(title.className).not.toContain("text-content-inverse");
    expect(title.className).toContain("font-display");
    expect(title.className).toContain("text-3xl");
  });
});
