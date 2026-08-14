import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChamferFrame } from "@/components/ui/chamfer-frame";

const meta = {
  title: "UI/ChamferFrame",
  component: ChamferFrame,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    cut: {
      control: { type: "inline-radio" },
      options: ["sm", "md", "lg"],
    },
    corners: {
      control: { type: "inline-radio" },
      options: ["outer", "all"],
    },
    edge: {
      control: { type: "inline-radio" },
      options: ["none", "neutral", "gold", "lighting"],
    },
    shadow: {
      control: { type: "inline-radio" },
      options: ["none", "sm", "md", "lg"],
    },
    interactive: { control: { type: "boolean" } },
  },
  args: {
    cut: "md",
    corners: "outer",
    edge: "none",
    surfaceClassName: "bg-surface-1 px-6 py-4",
    children: "Straw Hat Aggro",
  },
} satisfies Meta<typeof ChamferFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

const LABEL = "text-content-tertiary text-sm";

/** The ratified default: borderless surface, one elevation step above page. */
export const Default: Story = {};

export const CutSteps: Story = {
  name: "Cut Steps",
  render: (args) => (
    <div className="bg-surface-base flex items-center gap-6 p-6">
      {(["sm", "md", "lg"] as const).map((cut) => (
        <div key={cut} className="flex flex-col items-center gap-2">
          <ChamferFrame {...args} cut={cut}>
            {cut === "sm" ? "4px" : cut === "md" ? "8px" : "12px"}
          </ChamferFrame>
          <span className={LABEL}>cut=&quot;{cut}&quot;</span>
        </div>
      ))}
    </div>
  ),
};

export const CutPatterns: Story = {
  name: "Cut Patterns",
  render: (args) => (
    <div className="bg-surface-base flex items-center gap-6 p-6">
      {(["outer", "all"] as const).map((corners) => (
        <div key={corners} className="flex flex-col items-center gap-2">
          <ChamferFrame {...args} cut="lg" corners={corners}>
            {corners === "outer" ? "Top-left + bottom-right" : "Four corners"}
          </ChamferFrame>
          <span className={LABEL}>corners=&quot;{corners}&quot;</span>
        </div>
      ))}
    </div>
  ),
};

export const EdgeVariants: Story = {
  name: "Edge Variants",
  render: (args) => (
    <div className="bg-surface-base flex flex-wrap items-center gap-6 p-6">
      {(["none", "neutral", "gold", "lighting"] as const).map((edge) => (
        <div key={edge} className="flex flex-col items-center gap-2">
          <ChamferFrame {...args} cut="lg" edge={edge}>
            {edge === "none" ? "Borderless" : "Hairline"}
          </ChamferFrame>
          <span className={LABEL}>edge=&quot;{edge}&quot;</span>
        </div>
      ))}
    </div>
  ),
};

/** Tab through the row to prove the chamfered focus halo on every variant. */
export const InteractiveFocus: Story = {
  name: "Interactive Focus",
  render: (args) => (
    <div className="bg-surface-base flex flex-col gap-4 p-6">
      <p className={LABEL}>
        Tab through the frames — the halo follows the cut on every edge variant,
        and the hit target stays rectangular.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        {(["none", "neutral", "gold", "lighting"] as const).map((edge) => (
          <ChamferFrame
            key={edge}
            {...args}
            asChild
            interactive
            cut="lg"
            edge={edge}
          >
            <button type="button">Start Match</button>
          </ChamferFrame>
        ))}
      </div>
    </div>
  ),
};

/**
 * The cast follows the cuts. `box-shadow` would paint square corners straight
 * through both chamfers, so the frame translates a copy of its own polygon
 * instead — check the top-left cut, where nothing should poke out, and the
 * bottom-right cut, where the cast tracks the 45° edge.
 */
export const CastShadow: Story = {
  name: "Cast Shadow",
  render: (args) => (
    <div className="bg-surface-base flex flex-wrap items-center gap-8 p-8">
      {(["none", "sm", "md", "lg"] as const).map((shadow) => (
        <div key={shadow} className="flex flex-col items-center gap-2">
          <ChamferFrame {...args} cut="lg" shadow={shadow}>
            {shadow === "none" ? "Flat" : "Raised"}
          </ChamferFrame>
          <span className={LABEL}>shadow=&quot;{shadow}&quot;</span>
        </div>
      ))}
    </div>
  ),
};

/** The decks-row register: one tier up on hover, color and cast together. */
export const CardClassRow: Story = {
  name: "Card Class Row",
  render: (args) => (
    <div className="bg-surface-base flex w-full max-w-2xl flex-col gap-4 p-8">
      <p className={LABEL}>
        Hover a row — it moves one full tier: `bg-surface-1` → `bg-surface-2`
        and `shadow-sm` → `shadow-md`, which the elevation ladder pairs per
        tier.
      </p>
      <div className="flex flex-col gap-3">
        {["Straw Hat Aggro", "Enel Control"].map((name) => (
          <ChamferFrame
            {...args}
            key={name}
            interactive
            cut="lg"
            shadow="sm"
            shadowHover="md"
            className="group"
            surfaceClassName="bg-surface-1 group-hover:bg-surface-2 flex items-center gap-4 p-4 transition-colors duration-200"
          >
            <div className="bg-surface-3 aspect-card w-card-thumb shrink-0 rounded-md" />
            <span className="text-content-primary text-base font-semibold">
              {name}
            </span>
          </ChamferFrame>
        ))}
      </div>
    </div>
  ),
};

/** Figure-ground: the card stays the only rounded rectangle in view. */
export const FigureGround: Story = {
  name: "Figure Ground",
  render: (args) => (
    <div className="bg-surface-base p-6">
      <ChamferFrame
        {...args}
        cut="lg"
        corners="all"
        edge="neutral"
        surfaceClassName="bg-surface-1 flex items-center justify-center p-8"
      >
        <div className="bg-surface-3 aspect-card w-card-thumb rounded-md" />
      </ChamferFrame>
    </div>
  ),
};
