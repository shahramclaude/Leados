import { NextResponse } from "next/server";
import { listOrgs, listUsersByOrg } from "@/db/repositories/orgs";

/**
 * Public, read-only listing used by the sign-in screen so reviewers can pick
 * any seeded org/role combination without a password flow. This is a demo
 * convenience, not a production auth system — see AI-SESSION-LOG.md.
 */
export async function GET() {
  const orgs = await listOrgs();
  const result = await Promise.all(
    orgs.map(async (org) => ({
      org: { id: org.id, name: org.name, slug: org.slug },
      users: (await listUsersByOrg(org.id)).map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email })),
    })),
  );
  return NextResponse.json({ orgs: result });
}
