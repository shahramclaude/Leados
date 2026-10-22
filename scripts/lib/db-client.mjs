import "dotenv/config";
import pg from "pg";

export function makeClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return new pg.Client({ connectionString: databaseUrl });
}

export async function withClient(fn) {
  const client = makeClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
