import type { NextConfig } from "next";
import createBundleAnalyzer from "@next/bundle-analyzer";

// `ANALYZE=true npm run build` emits .next/analyze/*.html treemaps per
// route — this is the "analyzer output per route" measurement tool used in
// Phase 0/4. It is a no-op (identity wrapper) unless ANALYZE=true, so it
// never affects a normal production build.
const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Keeps per-import tree-shaking tight for any package we add to a client
  // bundle later, so one `import { x } from "lib"` can't silently pull the
  // whole package in. No heavy UI/chart libraries are used in this slice by
  // design (see docs/PERFORMANCE.md "why no recharts/visx").
  experimental: {
    optimizePackageImports: [],
  },
};

export default withBundleAnalyzer(nextConfig);
