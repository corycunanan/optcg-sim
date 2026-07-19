import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PREGAME_MODE_OPTIONS,
  PregameSettings,
  SOLITAIRE_PREGAME_MODE_OPTIONS,
} from "./pregame-settings";

function renderSettings(editable: boolean) {
  return renderToStaticMarkup(
    <PregameSettings
      value="HOST_FIRST"
      editable={editable}
      onChange={vi.fn()}
    />,
  );
}

describe("PregameSettings", () => {
  it("renders all four explanatory choices as host-editable radios", () => {
    const markup = renderSettings(true);

    expect(markup.match(/type="radio"/g)).toHaveLength(4);
    for (const option of PREGAME_MODE_OPTIONS) {
      expect(markup).toContain(option.summary);
      expect(markup).toContain(option.explanation);
    }
    expect(markup).toMatch(/checked="" value="HOST_FIRST"/);
    expect(markup).not.toContain("disabled=\"\"");
    expect(markup).not.toContain("Host controlled");
  });

  it("renders the same selection read-only for guests", () => {
    const markup = renderSettings(false);

    expect(markup.match(/disabled=""/g)).toHaveLength(4);
    expect(markup).toContain("Host controlled");
    expect(markup).toMatch(/checked="" value="HOST_FIRST"/);
  });

  it("renders Side A, Side B, and Random for Solitaire", () => {
    const markup = renderToStaticMarkup(
      <PregameSettings
        mode="SOLITAIRE"
        value="SIDE_B_FIRST"
        editable
        onChange={vi.fn()}
      />,
    );

    expect(markup).toContain("Side to go first");
    expect(markup.match(/type="radio"/g)).toHaveLength(3);
    for (const option of SOLITAIRE_PREGAME_MODE_OPTIONS) {
      expect(markup).toContain(option.summary);
      expect(markup).toContain(option.explanation);
    }
    expect(markup).toMatch(/checked="" value="SIDE_B_FIRST"/);
    for (const option of PREGAME_MODE_OPTIONS) {
      expect(markup).not.toContain(`value="${option.value}"`);
    }
  });
});
