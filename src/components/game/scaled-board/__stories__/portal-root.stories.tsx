import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PortalRoot, ScaledBoard } from "@/components/game/scaled-board";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

const meta = {
  title: "Scaled Board/PortalRoot",
  component: PortalRoot,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Top-level portal target for overlays that must escape the scaled subtree. Mount **before** `<ScaledBoard>` so `#overlay-root` exists when scaled descendants first portal into it.",
      },
    },
  },
} satisfies Meta<typeof PortalRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TooltipFromInsideScaledSubtree: Story = {
  name: "Tooltip from inside scaled subtree",
  render: () => (
    <TooltipProvider>
      <PortalRoot />
      <div className="flex h-screen w-screen items-center justify-center bg-surface-base">
        <div style={{ width: 1280, height: 720 }} className="bg-surface-1 shadow-md">
          <ScaledBoard designWidth={1920} designHeight={1080}>
            <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-navy-100">
              <Tooltip content="I rendered into #overlay-root, outside the scaled subtree.">
                <button
                  type="button"
                  className="rounded-md bg-navy-900 px-6 py-3 text-base text-content-inverse"
                >
                  Hover me
                </button>
              </Tooltip>
              <p className="font-sans text-sm text-content-secondary">
                Open DevTools — the tooltip mounts inside <code>#overlay-root</code>,{" "}
                a sibling of <code>&lt;ScaledBoard&gt;</code>, not a descendant.
              </p>
            </div>
          </ScaledBoard>
        </div>
      </div>
    </TooltipProvider>
  ),
};
