// Named roles used across Part 46. In the full LEADOS system these come from
// the identity/authz service built in earlier parts; here they are the
// integration seam. Actor identity for every API call is supplied via the
// `x-actor-id` / `x-actor-role` headers, which a real deployment would derive
// from an authenticated session rather than trust from the client directly.

export const ROLES = {
  EMPLOYEE: "employee",
  MANAGER: "manager",
  HR_MANAGER: "hr_manager",
  ETHICS_OFFICER: "ethics_officer",
  OMBUDSMAN: "ombudsman",
  BOARD_LIAISON: "board_liaison",
  ADMIN: "admin",
  CEO: "ceo",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * The ONLY roles permitted to resolve a safe-channel reporter's identity.
 * Deliberately short and deliberately does NOT include ADMIN or CEO —
 * organizational power must not translate into channel access power.
 * Every attempt by any other role (including the most senior ones) is
 * logged and alerted, never silently allowed.
 */
export const SAFE_CHANNEL_IDENTITY_ROLES: Role[] = [ROLES.OMBUDSMAN, ROLES.ETHICS_OFFICER];

/** Roles allowed to see case metadata/body (triage/investigation), not identity. */
export const SAFE_CHANNEL_CASE_ROLES: Role[] = [ROLES.OMBUDSMAN, ROLES.ETHICS_OFFICER, ROLES.BOARD_LIAISON];

/** Roles with standing to request or approve dual-control (T4) actions. */
export const DUAL_CONTROL_ELIGIBLE_ROLES: Role[] = [ROLES.ADMIN, ROLES.CEO, ROLES.HR_MANAGER, ROLES.ETHICS_OFFICER];

/** Roles with standing to approve a dissent-suggestion archive request. */
export const DISSENT_ARCHIVE_ROLES: Role[] = [ROLES.OMBUDSMAN, ROLES.ETHICS_OFFICER, ROLES.BOARD_LIAISON];

export interface Actor {
  personId: number | null;
  role: Role | null;
}

export function actorFromHeaders(headers: Headers): Actor {
  const idRaw = headers.get("x-actor-id");
  const role = headers.get("x-actor-role") as Role | null;
  const personId = idRaw ? Number.parseInt(idRaw, 10) : null;
  return {
    personId: Number.isFinite(personId) ? personId : null,
    role: role && Object.values(ROLES).includes(role) ? role : null,
  };
}
