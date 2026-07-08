import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Monorepo root, so Turbopack can resolve the workspace package
  // @multigoogle/core (symlinked at ../../packages/core).
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
