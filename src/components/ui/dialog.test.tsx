// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

afterEach(cleanup);

function renderDialog(
  className?: string,
  size?: ComponentProps<typeof DialogContent>["size"]
) {
  const result = render(
    <Dialog open>
      <DialogContent className={className} size={size}>
        <DialogTitle>Dialog title</DialogTitle>
        <DialogDescription>Dialog description</DialogDescription>
        <div>Dialog content</div>
      </DialogContent>
    </Dialog>
  );

  return result.container.ownerDocument.querySelector<HTMLElement>(
    '[data-slot="dialog-content"]'
  );
}

describe("DialogContent", () => {
  it("animates the real Radix overlay and content through data-state", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));

    const overlay = document.querySelector<HTMLElement>(
      '[data-slot="dialog-overlay"]'
    );
    const content = screen.getByRole("dialog");

    for (const element of [overlay, content]) {
      expect(element?.getAttribute("data-state")).toBe("open");
      expect(element?.matches('[data-state="open"]')).toBe(true);
      expect(element?.hasAttribute("data-open")).toBe(false);
      expect(element?.hasAttribute("data-closed")).toBe(false);

      const classes = element?.className.split(/\s+/) ?? [];
      expect(classes).toContain("data-[state=open]:animate-in");
      expect(classes).not.toContain("data-open:animate-in");
      expect(classes).not.toContain("data-closed:animate-out");
    }
  });

  it("uses the shared modal chrome and default width", () => {
    const classes = renderDialog()?.className.split(/\s+/);

    expect(classes).toEqual(
      expect.arrayContaining([
        "rounded-lg",
        "border",
        "border-border",
        "bg-popover",
        "shadow-lg",
        "sm:max-w-lg",
      ])
    );
  });

  it("supports the shared 2xl modal width", () => {
    const classes = renderDialog(undefined, "2xl")?.className.split(/\s+/);

    expect(classes).toContain("sm:max-w-6xl");
    expect(classes).not.toContain("sm:max-w-lg");
  });

  it("bounds tall content to the viewport and scrolls internally", () => {
    const content = renderDialog();
    const classes = content?.className.split(/\s+/);

    expect(classes).toContain("max-h-[calc(100dvh-2rem)]");
    expect(classes).toContain("overflow-y-auto");
  });

  it("allows consumers to override internal scrolling", () => {
    const content = renderDialog("overflow-hidden");
    const classes = content?.className.split(/\s+/);

    expect(classes).toContain("overflow-hidden");
    expect(classes).not.toContain("overflow-y-auto");
  });
});
