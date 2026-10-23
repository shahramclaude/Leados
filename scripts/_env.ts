// Shared bootstrap for all scripts/*.ts — loads .env before anything else
// touches `src/db` (which throws if DATABASE_URL is missing).
import "dotenv/config";
