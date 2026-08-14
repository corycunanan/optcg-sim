import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import type { CardFilterDraft } from "@/lib/cards/browser-params";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  filtersDialogProps: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

// The dialog itself is covered by card-filters-dialog.test.tsx; here we only
// care that the browser opens it and commits its draft exactly once.
vi.mock("./card-filters-dialog", () => ({
  CARD_FILTERS_DIALOG_ID: "card-filters",
  CardFiltersDialog: (props: {
    open: boolean;
    onApply: (draft: CardFilterDraft) => void;
  }) => {
    mocks.filtersDialogProps(props);
    return props.open ? <div id="card-filters" /> : null;
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

const noFilters = {
  q: "",
  color: "",
  type: "",
  set: latestSet,
  block: "",
  originOnly: "",
};

async function renderBrowser(
  currentFilters: Partial<typeof noFilters> = {},
  overrides: { totalPages?: number; setsPath?: string } = {}
) {
  await act(async () => {
    renderer = create(
      <CardBrowser
        initialCards={[]}
        total={0}
        page={1}
        totalPages={overrides.totalPages ?? 0}
        sets={sets}
        currentFilters={{ ...noFilters, ...currentFilters }}
        routePath="/cards"
        setsPath={overrides.setsPath}
      />
    );
  });
  return renderer!;
}

function filterButton() {
  return renderer!.root.findByProps({ "aria-controls": "card-filters" });
}

function latestDialogProps() {
  return mocks.filtersDialogProps.mock.calls.at(-1)![0];
}

async function openFilters() {
  await act(async () => filterButton().props.onClick());
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.filtersDialogProps.mockReset();
  mocks.searchParams = new URLSearchParams();
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
  it("opens the filter dialog from the header button", async () => {
    await renderBrowser();

    expect(filterButton().props["aria-expanded"]).toBe(false);
    expect(latestDialogProps().open).toBe(false);

    await openFilters();

    expect(filterButton().props["aria-expanded"]).toBe(true);
    expect(latestDialogProps().open).toBe(true);
    expect(renderer!.root.findByProps({ id: "card-filters" })).toBeDefined();
    // Opening the dialog must not touch the URL — the draft lives in the modal.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("commits a whole draft in a single navigation", async () => {
    await renderBrowser();
    await openFilters();

    await act(async () =>
      latestDialogProps().onApply({
        colors: ["Red", "Blue"],
        types: ["Leader"],
        blocks: ["2"],
        sets: [latestSet],
        originOnly: true,
      })
    );

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      `/cards?set=${latestSet}&color=Red%2CBlue&type=Leader&block=2&originOnly=true`
    );
    // Applying closes the dialog.
    expect(latestDialogProps().open).toBe(false);
  });

  it("preserves the effective set when only another filter changes", async () => {
    await renderBrowser();
    await openFilters();

    await act(async () =>
      latestDialogProps().onApply({
        colors: ["Red"],
        types: [],
        blocks: [],
        sets: [latestSet],
        originOnly: false,
      })
    );

    expect(mocks.push).toHaveBeenCalledWith(`/cards?set=${latestSet}&color=Red`);
  });

  it("switches to the All Sets view when the draft clears every set", async () => {
    await renderBrowser();
    await openFilters();

    await act(async () =>
      latestDialogProps().onApply({
        colors: [],
        types: [],
        blocks: [],
        sets: [],
        originOnly: false,
      })
    );

    expect(mocks.push).toHaveBeenCalledWith("/cards?set=all");
  });

  it("does not navigate when the applied draft matches the current filters", async () => {
    await renderBrowser({ color: "Red" });
    await openFilters();

    await act(async () =>
      latestDialogProps().onApply({
        colors: ["Red"],
        types: [],
        blocks: [],
        sets: [latestSet],
        originOnly: false,
      })
    );

    expect(mocks.push).not.toHaveBeenCalled();
    expect(latestDialogProps().open).toBe(false);
  });

  it("counts every narrowing in force on the Filter button", async () => {
    await renderBrowser({ color: "Red,Blue", block: "1" });

    // 2 colors + 1 block + the set the results are scoped to.
    expect(
      renderer!.root.findByProps({ "data-slot": "badge" }).props.children
    ).toBe(4);
  });

  it("omits the count badge when nothing narrows the results", async () => {
    await renderBrowser({ set: "" });

    expect(renderer!.root.findAllByProps({ "data-slot": "badge" })).toHaveLength(
      0
    );
  });
});

describe("CardBrowser zero results", () => {
  it("offers a way back into the filters and a full reset", async () => {
    await renderBrowser({ color: "Red" });

    const emptyState = renderer!.root.findByProps({
      children: "No cards match these filters",
    });
    expect(emptyState).toBeDefined();

    const editFilters = renderer!.root
      .findAllByType("button")
      .find((node) => nodeText(node).includes("Edit filters"));
    await act(async () => editFilters!.props.onClick());
    expect(latestDialogProps().open).toBe(true);

    const clearAll = renderer!.root
      .findAllByType("button")
      .find((node) => nodeText(node).includes("Clear all"));
    await act(async () => clearAll!.props.onClick());

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/cards?set=all");
  });

  it("keeps the reset actions out of an unfiltered empty result", async () => {
    await renderBrowser({ set: "" });

    expect(
      renderer!.root
        .findAllByType("button")
        .some((node) => nodeText(node).includes("Edit filters"))
    ).toBe(false);
  });
});

describe("CardBrowser set-browser wayfinding", () => {
  // The navbar's Cards dropdown was the only inbound link to /sets (OPT-680);
  // SetBrowser links outward only, so without this the set browser is
  // unreachable from anywhere in the product.
  it("links to the set browser from the page header", async () => {
    await renderBrowser({}, { setsPath: "/sets" });

    const header = renderer!.root.findByType("header");
    expect(setsAnchors(header)).toHaveLength(1);

    const actionsRow = header.find((node) =>
      classList(node).includes("flex-wrap")
    );
    const contentColumn = header.find((node) =>
      classList(node).includes("min-w-0")
    );
    const actionsLinks = setsAnchors(actionsRow);

    expect(actionsLinks).toHaveLength(1);
    expect(actionsLinks[0].type).toBe("a");
    expect(actionsLinks[0].props.href).toBe("/sets");
    expect(actionsLinks[0].props["data-variant"]).toBe("default");
    expect(setsAnchors(contentColumn)).toHaveLength(0);
    expect(
      actionsRow.findAllByProps({ "aria-controls": "card-filters" }).length
    ).toBeGreaterThan(0);
  });

  it("omits the link where no set browser is configured", async () => {
    await renderBrowser();

    const header = renderer!.root.findByType("header");
    const actionsRow = header.find((node) =>
      classList(node).includes("flex-wrap")
    );

    expect(setsAnchors(actionsRow)).toHaveLength(0);
    expect(
      actionsRow.findByProps({ "aria-controls": "card-filters" })
    ).toBeDefined();
  });
});

describe("CardBrowser layout", () => {
  it("aligns every content section to the app-wide container", async () => {
    await renderBrowser({ set: "OP15" }, { totalPages: 3 });

    // Every horizontally padded section must sit in the max-w-7xl container so
    // the header, search, grid, and pagination keep the same left edge.
    const paddedSections = renderer!.root
      .findAllByType("div")
      .filter((node) => classList(node).includes("px-6"));

    expect(paddedSections.length).toBeGreaterThanOrEqual(3);
    for (const section of paddedSections) {
      expect(
        classList(section).includes("max-w-7xl") || hasContainerAncestor(section)
      ).toBe(true);
    }
  });

  it("renders the route loading skeleton in the same container", async () => {
    await act(async () => {
      renderer = create(<CardBrowserLoading />);
    });

    const paddedSections = renderer!.root.findAll(
      (node) =>
        typeof node.type === "string" && classList(node).includes("px-6")
    );

    // The skeleton renders at route level with no padded parent, so each of its
    // bands must carry the container itself or it will jump on load.
    expect(paddedSections.length).toBeGreaterThanOrEqual(3);
    for (const section of paddedSections) {
      const classes = classList(section);
      expect(classes).toContain("max-w-7xl");
      expect(classes).not.toContain("-mx-6");
    }

    // The skeleton's header IS the shared primitive, not a copy of its classes:
    // it is the `<header>` element and it carries the primitive's top-only
    // padding, so the skeleton cannot drift from the loaded header.
    const skeletonHeader = renderer!.root.findByType("header");
    expect(classList(skeletonHeader)).toContain("pt-8");
    expect(classList(skeletonHeader)).not.toContain("border-b");
    expect(classList(skeletonHeader)).not.toContain("bg-navy-900");
  });
});

/** Rendered `<a href="/sets">` elements, not the `next/link` wrappers. */
function setsAnchors(scope: ReactTestInstance): ReactTestInstance[] {
  return scope.findAll(
    (node) => node.type === "a" && node.props.href === "/sets",
    { deep: true }
  );
}

function classList(node: ReactTestInstance): string[] {
  return String(node.props.className ?? "").split(/\s+/);
}

function hasContainerAncestor(node: ReactTestInstance): boolean {
  let current = node.parent;
  while (current) {
    if (classList(current).includes("max-w-7xl")) return true;
    current = current.parent;
  }
  return false;
}

function nodeText(node: ReactTestInstance): string {
  const children = node.props.children;
  return (Array.isArray(children) ? children : [children])
    .filter((value: unknown): value is string => typeof value === "string")
    .join(" ");
}
