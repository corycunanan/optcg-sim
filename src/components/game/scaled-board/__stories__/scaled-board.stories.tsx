import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ScaledBoard } from "@/components/game/scaled-board";

function BoardPlaceholder() {
  return (
    <div className="relative h-full w-full bg-navy-100">
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="border border-navy-500" />
        ))}
      </div>
      <CornerMarker className="left-4 top-4" />
      <CornerMarker className="right-4 top-4" />
      <CornerMarker className="left-4 bottom-4" />
      <CornerMarker className="right-4 bottom-4" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-6xl text-navy-900">1920×1080</span>
      </div>
    </div>
  );
}

function CornerMarker({ className }: { className: string }) {
  return (
    <div className={`absolute size-12 rounded border-4 border-gold-500 ${className}`} />
  );
}

const meta = {
  title: "Scaled Board/ScaledBoard",
  component: ScaledBoard,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Authors content at a fixed design resolution and scales it uniformly to fit. Resize the canvas to see the placeholder rescale while staying centered both axes.",
      },
    },
  },
  args: {
    designWidth: 1920,
    designHeight: 1080,
    children: null,
  },
} satisfies Meta<typeof ScaledBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FluidViewport: Story = {
  name: "Fluid viewport (resize canvas)",
  render: () => (
    <div className="h-screen w-screen bg-surface-base">
      <ScaledBoard designWidth={1920} designHeight={1080}>
        <BoardPlaceholder />
      </ScaledBoard>
    </div>
  ),
};

export const Frame1280x720: Story = {
  name: "1280×720 frame (≈0.67×)",
  render: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-base">
      <div style={{ width: 1280, height: 720 }} className="bg-surface-1 shadow-md">
        <ScaledBoard designWidth={1920} designHeight={1080}>
          <BoardPlaceholder />
        </ScaledBoard>
      </div>
    </div>
  ),
};

export const Frame1920x1080: Story = {
  name: "1920×1080 frame (1.0×)",
  render: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-base">
      <div style={{ width: 1920, height: 1080 }} className="bg-surface-1 shadow-md">
        <ScaledBoard designWidth={1920} designHeight={1080}>
          <BoardPlaceholder />
        </ScaledBoard>
      </div>
    </div>
  ),
};

export const Frame2560x1440: Story = {
  name: "2560×1440 frame (≈1.33×)",
  render: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-base">
      <div style={{ width: 2560, height: 1440 }} className="bg-surface-1 shadow-md">
        <ScaledBoard designWidth={1920} designHeight={1080}>
          <BoardPlaceholder />
        </ScaledBoard>
      </div>
    </div>
  ),
};
