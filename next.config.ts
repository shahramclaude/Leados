import type { NextConfig } from "next";

// `output: "standalone"` produces a minimal, self-contained server bundle
// under .next/standalone, which Dockerfile copies into the runtime stage.
// See docs/DEPLOYMENT.md.
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
