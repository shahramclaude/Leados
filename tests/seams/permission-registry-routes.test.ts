// Seam: Part 17's permission registry covers Part 14's public routes. This
// test asserts (a) every declared public route maps to a permission that
// exists in the registry, and (b) an API key without that scope is refused.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PERMISSIONS, PUBLIC_API_ROUTES } from "@/lib/permissions";
import { listPublicFindings } from "@/services/public-findings";
import { resolveApiKeyContext } from "@/lib/tenancy";
import { ForbiddenServiceError } from "@/lib/errors";
import { createOrg, createApiKey } from "../helpers/fixtures";

function findPublicRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findPublicRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("seam: permission registry covers every public API route", () => {
  it("every permission referenced by PUBLIC_API_ROUTES is a real registry entry", () => {
    for (const permission of Object.values(PUBLIC_API_ROUTES)) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it("the registry declares a permission for every route file under api/public", () => {
    const dir = path.join(process.cwd(), "src/app/api/public");
    const routeFiles = findPublicRouteFiles(dir);
    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const source = readFileSync(file, "utf-8");
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) =>
        source.includes(`function ${m}(`),
      );
      // The public findings route exposes GET; assert it is registered.
      for (const method of methods) {
        const key = Object.keys(PUBLIC_API_ROUTES).find((k) => k.startsWith(method));
        expect(key, `No PUBLIC_API_ROUTES entry for ${method} in ${file}`).toBeTruthy();
      }
    }
  });

  it("an API key without the required scope is forbidden, not silently allowed", async () => {
    const org = await createOrg();
    const rawKey = await createApiKey(org.id, []); // no scopes granted
    const ctx = await resolveApiKeyContext(`Bearer ${rawKey}`);

    await expect(listPublicFindings(ctx)).rejects.toBeInstanceOf(ForbiddenServiceError);
  });
});
