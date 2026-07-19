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

let renderer: ReactTestRenderer | null = null;

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
  it("toggles the existing filter panel and supports the All Sets view", async () => {
    await act(async () => {
      renderer = create(
        <CardBrowser
          initialCards={[]}
          total={0}
          page={1}
          totalPages={0}
          sets={[{ setLabel: "OP15", setName: "Example Set", packId: "OP15" }]}
          currentFilters={{
            q: "",
            color: "",
            type: "",
            set: "OP15-EB04",
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
