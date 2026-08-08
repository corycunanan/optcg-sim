// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

afterEach(cleanup);

function renderDialog(className?: string) {
  const result = render(
    <Dialog open>
      <DialogContent className={className}>
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
