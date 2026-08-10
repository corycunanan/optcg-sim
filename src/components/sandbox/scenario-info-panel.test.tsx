// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scenarios } from "@/lib/sandbox/scenarios";
import { ScenarioInfoPanel } from "./scenario-info-panel";

afterEach(cleanup);

describe("ScenarioInfoPanel", () => {
  it("renders the scenario title as the single level-one heading", () => {
    const scenario = scenarios[0];

    render(<ScenarioInfoPanel scenario={scenario} hint={null} />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: scenario.title })
    ).toBe(headings[0]);
  });
});
