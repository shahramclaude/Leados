import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright drives the app via 127.0.0.1 in dev mode (see
  // playwright.config.ts) — allow it so dev-only HMR requests aren't blocked.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
