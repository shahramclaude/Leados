import { config as loadEnv } from "dotenv";
import "@testing-library/jest-dom/vitest";

// Load .env for DATABASE_URL etc., mirroring Next.js's own env loading, so
// `npm test` works the same way `npm run build` / `next dev` do.
loadEnv({ path: ".env" });
