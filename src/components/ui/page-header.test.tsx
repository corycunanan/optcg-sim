// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

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
});
