import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  stories: [
    "../src/**/__stories__/*.mdx",
    "../src/**/__stories__/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  staticDirs: ["../public"],
  typescript: {
    check: false,
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
