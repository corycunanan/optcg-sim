import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: { type: "select" },
      options: [
        "default",
        "secondary",
        "outline",
        "ghost",
        "destructive",
        "gold",
        "link",
      ],
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg", "icon", "icon-sm"],
    },
  },
  args: {
    children: "Set Sail",
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Outline: Story = {
  args: { variant: "outline" },
};

export const Gold: Story = {
  args: { variant: "gold", children: "Treasure" },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Concede" },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const DisplayFontProof: Story = {
  name: "Display Font Proof",
  render: () => (
    <div className="flex flex-col items-center gap-4">
      <h1 className="font-display text-3xl">One Piece TCG</h1>
      <p className="font-sans text-base text-content-secondary">
        Geist Sans body — DM Serif Display heading.
      </p>
      <Button>Confirm</Button>
    </div>
  ),
};
