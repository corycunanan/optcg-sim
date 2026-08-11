import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setFilterProps: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./set-filter", () => ({
  SetFilter: (props: { onChange: (sets: string[]) => void }) => {
    mocks.setFilterProps(props);
    return <div data-set-filter />;
  },
}));

import { CardBrowser } from "./card-browser";
import { CardBrowserLoading } from "./card-browser-loading";

let renderer: ReactTestRenderer | null = null;
const sets = [
  { setLabel: "OP15", setName: "Example Set", packId: "569115" },
  { setLabel: "OP16", setName: "Latest Set", packId: "569116" },
];
const latestSet = sets.at(-1)!.setLabel;

beforeEach(() => {
  mocks.push.mockReset();
  mocks.setFilterProps.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  vi.unstubAllGlobals();
});

describe("CardBrowser filters", () => {
  it("preserves the implicit default set when another filter changes", async () => {
    await act(async () => {
      renderer = create(
        <CardBrowser
          initialCards={[]}
          total={0}
          page={1}
          totalPages={0}
          sets={sets}
          currentFilters={{
            q: "",
            color: "",
            type: "",
            set: latestSet,
            block: "",
            originOnly: "",
          }}
          routePath="/cards"
        />
      );
    });

    await act(async () =>
      renderer!.root
        .findByProps({ "aria-controls": "card-filters" })
        .props.onClick()
    );
    const redFilter = renderer!.root
      .findAllByType("button")
      .find((candidate) => candidate.props.children === "Red");

    await act(async () => redFilter!.props.onClick());

    expect(mocks.push).toHaveBeenCalledWith(
      `/cards?set=${latestSet}&color=Red`
    );
  });

  it("toggles the existing filter panel and supports the All Sets view", async () => {
    await act(async () => {
      renderer = create(
        <CardBrowser
          initialCards={[]}
          total={0}
          page={1}
          totalPages={0}
          sets={sets}
          currentFilters={{
            q: "",
            color: "",
            type: "",
            set: latestSet,
            block: "",
            originOnly: "",
          }}
          routePath="/cards"
        />
      );
    });

    const filterButton = renderer!.root.findByProps({
      "aria-controls": "card-filters",
    });
    expect(filterButton.props["aria-expanded"]).toBe(false);

    await act(async () => filterButton.props.onClick());

    expect(
      renderer!.root.findByProps({ "aria-controls": "card-filters" }).props[
        "aria-expanded"
      ]
    ).toBe(true);
    expect(renderer!.root.findByProps({ id: "card-filters" })).toBeDefined();

    const setFilterProps = mocks.setFilterProps.mock.calls.at(-1)?.[0];
    await act(async () => setFilterProps.onChange([]));

    expect(mocks.push).toHaveBeenCalledWith("/cards?set=all");
  });
});

describe("CardBrowser layout", () => {
  it("aligns every content section to the app-wide container", async () => {
    await act(async () => {
      renderer = create(
        <CardBrowser
          initialCards={[]}
          total={0}
          page={1}
          totalPages={3}
          sets={[{ setLabel: "OP15", setName: "Example Set", packId: "OP15" }]}
          currentFilters={{
            q: "",
            color: "",
            type: "",
            set: "OP15",
            block: "",
            originOnly: "",
          }}
          routePath="/cards"
        />
      );
    });

    await act(async () =>
      renderer!.root
        .findByProps({ "aria-controls": "card-filters" })
        .props.onClick()
    );

    // Every horizontally padded section must share the max-w-7xl container so
    // the header, filters, grid, and pagination keep the same left edge.
    const paddedSections = renderer!.root
      .findAllByType("div")
      .filter((node) =>
        String(node.props.className ?? "")
          .split(/\s+/)
          .includes("px-6")
      );

    expect(paddedSections.length).toBeGreaterThanOrEqual(4);
    for (const section of paddedSections) {
      expect(String(section.props.className).split(/\s+/)).toContain(
        "max-w-7xl"
      );
    }
  });

  it("renders the route loading skeleton in the same container", async () => {
    await act(async () => {
      renderer = create(<CardBrowserLoading />);
    });

    const paddedSections = renderer!.root
      .findAllByType("div")
      .filter((node) =>
        String(node.props.className ?? "")
          .split(/\s+/)
          .includes("px-6")
      );

    // The skeleton renders at route level with no padded parent, so each of its
    // bands must carry the container itself or it will jump on load.
    expect(paddedSections.length).toBeGreaterThanOrEqual(3);
    for (const section of paddedSections) {
      const classes = String(section.props.className).split(/\s+/);
      expect(classes).toContain("max-w-7xl");
      expect(classes).not.toContain("-mx-6");
    }
  });
});
