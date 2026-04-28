import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ScaledBoard, useBoardScale } from "@/components/game/scaled-board";

function ScaleDebugOverlay() {
  const { scale, designWidth, designHeight } = useBoardScale();
  return (
    <div className="absolute left-8 top-8 rounded-md bg-surface-1 px-6 py-4 font-mono text-base text-content-primary shadow-md">
      <div>
        scale: <span className="font-bold">{scale.toFixed(4)}</span>
      </div>
      <div>
        design: {designWidth}×{designHeight}
      </div>
    </div>
  );
}

function StageWithOverlay() {
  return (
    <div className="relative h-full w-full bg-navy-100">
      <ScaleDebugOverlay />
    </div>
  );
}

const meta = {
  title: "Scaled Board/useBoardScale",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Reads the current scale factor from `<ScaledBoard>`. Throws if used outside one. Resize the canvas / change the frame size to watch the value update.",
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
        <StageWithOverlay />
      </ScaledBoard>
    </div>
  ),
};

export const Frame1280x720: Story = {
  name: "1280×720 frame",
  render: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-base">
      <div style={{ width: 1280, height: 720 }} className="bg-surface-1 shadow-md">
        <ScaledBoard designWidth={1920} designHeight={1080}>
          <StageWithOverlay />
        </ScaledBoard>
      </div>
    </div>
  ),
};

export const Frame2560x1440: Story = {
  name: "2560×1440 frame",
  render: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-base">
      <div style={{ width: 2560, height: 1440 }} className="bg-surface-1 shadow-md">
        <ScaledBoard designWidth={1920} designHeight={1080}>
          <StageWithOverlay />
        </ScaledBoard>
      </div>
    </div>
  ),
};
