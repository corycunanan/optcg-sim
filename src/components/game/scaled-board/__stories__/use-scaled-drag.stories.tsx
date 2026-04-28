import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { motion } from "motion/react";
import {
  ScaledBoard,
  useBoardScale,
  useScaledDrag,
} from "@/components/game/scaled-board";

function DragStage() {
  const { scale } = useBoardScale();
  const drag = useScaledDrag();

  return (
    <div className="relative h-full w-full bg-navy-100">
      <div className="absolute left-8 top-8 rounded-md bg-surface-1 px-6 py-4 font-mono text-base text-content-primary shadow-md">
        scale: <span className="font-bold">{scale.toFixed(4)}</span>
        {" · "}
        {drag.isDragging ? "dragging" : "idle"}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          className="pointer-events-auto size-32 cursor-grab touch-none rounded-md bg-gold-500 shadow-md active:cursor-grabbing"
          style={{ x: drag.x, y: drag.y }}
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Scaled Board/useScaledDrag",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Pointer-driven drag with scale-aware delta math. Drag the gold square — at any frame size the cursor stays glued to the same point on the square because deltas are converted from viewport pixels to design pixels via `1 / scale`.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const FluidViewport: Story = {
  name: "Fluid viewport (resize canvas)",
  render: () => (
    <div className="h-screen w-screen bg-surface-base">
      <ScaledBoard designWidth={1920} designHeight={1080}>
        <DragStage />
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
          <DragStage />
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
          <DragStage />
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
          <DragStage />
        </ScaledBoard>
      </div>
    </div>
  ),
};
