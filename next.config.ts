import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The OPTCG engine sources in `workers/game/src` use NodeNext-style imports
  // (`./foo.js` resolving to `./foo.ts`). TypeScript and Vitest handle this
  // via `moduleResolution: "bundler"` and `resolve.alias` respectively, but
  // Webpack's default extension resolver does not — without this map, the
  // production build fails on `import { validate } from "./validation.js"`
  // when the sandbox playground hook pulls `runPipeline` into the client
  // bundle. Turbopack (Next 16's default builder) has no equivalent option
  // today, so `package.json`'s build script pins to `--webpack`. Revisit
  // when Turbopack ships an `extensionAlias`-equivalent.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
