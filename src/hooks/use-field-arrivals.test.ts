import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeFieldArrivals,
  useFieldArrivals,
} from "./use-field-arrivals";

let renderer: ReactTestRenderer | null = null;

function ArrivalAtMount({ id, entering }: { id: string; entering: boolean }) {
  const [enteredAtMount] = useState(entering);
  return React.createElement(
    "span",
    { "data-id": id, "data-entered-at-mount": enteredAtMount },
    id,
  );
}

function Probe({ ids }: { ids: string[] }) {
  const arrivals = useFieldArrivals(ids);
  return ids.map((id) =>
    React.createElement(ArrivalAtMount, {
      key: id,
      id,
      entering: arrivals.has(id),
    }),
  );
}

function render(ids: string[]) {
  act(() => {
    const element = React.createElement(Probe, { ids });
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
  if (!renderer) throw new Error("Arrival probe did not mount");
  return renderer.root;
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("computeFieldArrivals", () => {
  it("returns an empty set on the seeding render (prev === null)", () => {
    const arrivals = computeFieldArrivals(null, new Set(["a", "b"]));
    expect(arrivals.size).toBe(0);
  });

  it("returns ids present in current but not in prev", () => {
    const arrivals = computeFieldArrivals(new Set(["a"]), new Set(["a", "b", "c"]));
    expect(arrivals).toEqual(new Set(["b", "c"]));
  });

  it("returns empty when nothing changed", () => {
    const arrivals = computeFieldArrivals(new Set(["a", "b"]), new Set(["a", "b"]));
    expect(arrivals.size).toBe(0);
  });

  it("ignores removals — only new-to-current ids count as arrivals", () => {
    const arrivals = computeFieldArrivals(new Set(["a", "b"]), new Set(["a"]));
    expect(arrivals.size).toBe(0);
  });
});

describe("useFieldArrivals", () => {
  it("marks only a newly-added id as arriving on its mount render", () => {
    let root = render(["existing"]);
    expect(
      root.findByProps({ "data-id": "existing" }).props[
        "data-entered-at-mount"
      ],
    ).toBe(false);

    root = render(["existing", "new"]);

    expect(
      root.findByProps({ "data-id": "existing" }).props[
        "data-entered-at-mount"
      ],
    ).toBe(false);
    expect(
      root.findByProps({ "data-id": "new" }).props["data-entered-at-mount"],
    ).toBe(true);
  });
});
