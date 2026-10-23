// Minimal role/access seam for sensitive legal artifacts (Phase 5 answer #3).
//
// Negotiation dossiers concentrate leverage information that would materially harm LEADOS if it leaked
// to the counterparty or was seen outside the deal team. This module is intentionally simple — a real
// deployment should wire this into the product's real auth/role system — but every dossier-rendering
// surface MUST call `canViewDossier` rather than rendering unconditionally.

export type LegalRole = "deal_team" | "legal_ops" | "obligation_owner" | "read_only_viewer";

export interface AccessContext {
  role: LegalRole;
}

const DOSSIER_ALLOWED_ROLES: LegalRole[] = ["deal_team", "legal_ops"];

export function canViewDossier(ctx: AccessContext): boolean {
  return DOSSIER_ALLOWED_ROLES.includes(ctx.role);
}

/** Obligation owners and read-only viewers may see the obligation board and vault, never dossiers. */
export function canViewVaultAndBoard(ctx: AccessContext): boolean {
  return (["deal_team", "legal_ops", "obligation_owner", "read_only_viewer"] as LegalRole[]).includes(
    ctx.role,
  );
}

export function canConfirmExtraction(ctx: AccessContext): boolean {
  return ctx.role === "legal_ops" || ctx.role === "deal_team";
}
