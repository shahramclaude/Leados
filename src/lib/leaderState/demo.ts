// src/lib/leaderState/demo.ts
//
// There is no real session/auth module available in this sandbox checkout
// (see src/lib/auth.ts reconstruction note). The "My State" pages therefore
// operate as a fixed single demo identity so the feature is end-to-end
// demonstrable. Swapping DEMO_USER_ID for `session.user.id` is the only
// change needed to wire this to a real auth system.

import type { ActorContext } from "@/lib/privacy";

export const DEMO_USER_ID = "demo-leader-1";

export const DEMO_SELF_ACTOR: ActorContext = { userId: DEMO_USER_ID, role: "member" };

/** Non-owner actors used ONLY to demonstrate (and test) that they are denied. */
export const ATTACK_DEMO_ACTORS: ActorContext[] = [
  { userId: "someone-else-admin", role: "admin" },
  { userId: "someone-else-manager", role: "manager" },
  { userId: "someone-else-system", role: "system" },
  { userId: DEMO_USER_ID, role: "admin" }, // same id, elevated role header spoof — still fine since userId matches
];
