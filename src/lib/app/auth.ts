// src/lib/app/auth.ts — dev sign-in use-cases (see session.ts for the
// disclosed limitation this is built around).

import { listOrganizations, countOrganizations } from "@/lib/platform/db/orgsRepository";
import { listMembershipsForOrg } from "@/lib/platform/db/membershipsRepository";
import { getUserById } from "@/lib/platform/db/usersRepository";
import { getMembership } from "@/lib/platform/db/membershipsRepository";

export interface LoginChoice {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
}

export async function listLoginChoices(): Promise<LoginChoice[]> {
  const orgs = await listOrganizations();
  const choices: LoginChoice[] = [];
  for (const org of orgs) {
    const memberships = await listMembershipsForOrg(org.id);
    for (const membership of memberships) {
      const user = await getUserById(membership.userId);
      if (!user) continue;
      choices.push({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        role: membership.role,
      });
    }
  }
  return choices;
}

export async function needsFirstRunOnboarding(): Promise<boolean> {
  const count = await countOrganizations();
  return count === 0;
}

export async function verifyLoginChoice(userId: string, orgId: string): Promise<boolean> {
  const membership = await getMembership(userId, orgId);
  return !!membership;
}
