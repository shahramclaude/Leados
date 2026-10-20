import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle (.next/standalone)
  // with only the dependencies actually used at runtime traced in — this
  // is what the Dockerfile's runtime stage copies, so the final image
  // doesn't carry devDependencies or the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
