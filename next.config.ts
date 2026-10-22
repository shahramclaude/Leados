import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the release container image (docs/RELEASING.md,
  // .github/workflows/release.yml) small and self-contained.
  output: "standalone",
};

export default nextConfig;
