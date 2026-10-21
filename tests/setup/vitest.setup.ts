import { config } from "dotenv";

// Load .env for DATABASE_URL etc. when running outside of `next`'s own
// loader (vitest does not read .env automatically).
config({ path: ".env" });
