// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardContent, CardFooter, CardHeader } from "./card";

describe("Card", () => {
  it("renders chrome through the large chamfer frame", () => {
    const { container } = render(
      <Card data-testid="card">
        <CardHeader>Header</CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    const card = screen.getByTestId("card");
    expect(card.getAttribute("data-slot")).toBe("card");
    expect(card.getAttribute("data-cut")).toBe("lg");
    expect(card.getAttribute("data-edge")).toBe("neutral");
    const surface = container.querySelector('[data-slot="chamfer-surface"]');
    expect(surface?.classList.contains("chamfer-outer")).toBe(true);
    expect(surface?.classList.contains("bg-card")).toBe(true);
    expect(surface?.classList.contains("overflow-hidden")).toBe(true);
  });

  it("keeps layout classes on the root and visual classes on the surface", () => {
    const { container } = render(
      <Card
        className="w-full max-w-[400px]"
        surfaceClassName="bg-gb-surface text-center"
      >
        Content
      </Card>
    );

    const card = container.querySelector('[data-slot="card"]');
    const surface = container.querySelector('[data-slot="chamfer-surface"]');

    expect(card?.classList.contains("w-full")).toBe(true);
    expect(card?.classList.contains("max-w-[400px]")).toBe(true);
    expect(card?.classList.contains("bg-gb-surface")).toBe(false);
    expect(card?.classList.contains("text-center")).toBe(false);
    expect(surface?.classList.contains("bg-gb-surface")).toBe(true);
    expect(surface?.classList.contains("text-center")).toBe(true);
  });

  it("leaves edge images square inside the clipped surface", () => {
    const { container } = render(
      <Card>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Card art" src="/card.png" />
      </Card>
    );

    expect(screen.getByRole("img", { name: "Card art" }).className).toBe("");
    const surface = container.querySelector('[data-slot="chamfer-surface"]');
    expect(surface?.classList.contains("rounded-lg")).toBe(false);
  });
});
