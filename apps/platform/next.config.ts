import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app is self-contained; pin the Turbopack root to this directory so
  // Next doesn't infer the outer repo root from its lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
