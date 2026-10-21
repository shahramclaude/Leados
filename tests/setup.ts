import "dotenv/config";
import { beforeAll } from "vitest";

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the seam/contract test suite against a real Postgres instance.");
  }
});
