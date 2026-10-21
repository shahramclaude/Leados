import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// `ANALYZE=true npm run build` emits .next/analyze/*.html treemaps used to
// produce the per-route bundle numbers in docs/PERFORMANCE.md section B.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // NOTE: standalone output (Part 18's deployment story) is intentionally
  // NOT enabled here. src/workers/monteCarloWorker.cjs is loaded at runtime
  // via a `process.cwd()`-relative filesystem path (see src/lib/workerPool.ts)
  // rather than a static import, specifically so it is excluded from every
  // webpack/Turbopack bundle (see docs/PERFORMANCE.md section B). Next's
  // file tracer for `output: "standalone"` cannot see that dynamic path and
  // would omit the worker file from the standalone copy. Part 18 should
  // either add an explicit `outputFileTracingIncludes` entry for
  // `src/workers/**` or keep deploying the full build output (current
  // approach) — documented as a deliberate trade-off, not an oversight.
};

export default withBundleAnalyzer(nextConfig);
