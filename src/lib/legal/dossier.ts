// Negotiation-prep dossier compiler (Phase 1 "Alerting & negotiation memory", Phase 3e).
//
// Compiles, per counterparty: relationship history, obligations on both sides (clause-cited),
// leverage points (ecosystem-seam cited), and runs citation lint before marking the dossier "ready".
// ACCESS NOTE (Phase 5 answer #3): dossiers concentrate sensitive negotiating-leverage information.
// Every dossier row is created with `accessTier: 'deal_team_only'` and the UI must gate rendering on
// that tier — see src/lib/legal/access.ts.

import { db } from "@/db";
import { clauses, contracts, dossiers, obligations, parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lintDossier, type ClauseLintRecord, type DossierContent } from "./citationLint";
import { getEcosystemLeveragePoints } from "./ecosystemSeam";
import { LEGAL_DISCLAIMER_TEXT } from "./clauseTypes";

export async function compileDossier(counterpartyPartyId: number) {
  const [party] = await db.select().from(parties).where(eq(parties.id, counterpartyPartyId));
  if (!party) throw new Error("Counterparty not found");

  const relatedContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.counterpartyPartyId, counterpartyPartyId));

  const contractIds = relatedContracts.map((c) => c.id);

  const allClauses = contractIds.length
    ? (
        await Promise.all(contractIds.map((cid) => db.select().from(clauses).where(eq(clauses.contractId, cid))))
      ).flat()
    : [];

  const allObligations = contractIds.length
    ? (
        await Promise.all(
          contractIds.map((cid) => db.select().from(obligations).where(eq(obligations.contractId, cid))),
        )
      ).flat()
    : [];

  const confirmedClauses = allClauses.filter((c) => c.status === "confirmed");

  const content: DossierContent = {
    counterpartyName: party.name,
    generatedAt: new Date().toISOString(),
    disclaimer: LEGAL_DISCLAIMER_TEXT,
    sections: [
      {
        heading: "Relationship history",
        claims: relatedContracts.map((c) => ({
          text: `Contract "${c.title}" effective ${c.effectiveDate.toISOString().slice(0, 10)}, status ${c.status}.`,
          citation: { kind: "contract", contractId: c.id },
        })),
      },
      {
        heading: "Confirmed obligations on record (either side)",
        claims: allObligations
          .filter((o) => o.status !== "draft")
          .map((o) => {
            const clause = confirmedClauses.find((c) => c.id === o.clauseId);
            if (!clause) {
              // Should not happen given the human-confirmation gate, but fail loud via lint rather than
              // silently degrading — citing an obligation without a resolvable confirmed clause.
              return {
                text: o.description,
                citation: { kind: "obligation", obligationId: o.id },
              };
            }
            return {
              text: o.description,
              citation: {
                kind: "clause",
                clauseId: clause.id,
                documentId: clause.documentId,
                spanStart: clause.spanStart,
                spanEnd: clause.spanEnd,
                quote: clause.excerptText,
              },
            };
          }),
      },
      {
        heading: "Leverage points (ecosystem graph seam — Part 50)",
        claims: getEcosystemLeveragePoints(party.ecosystemNodeId).map((lp) => ({
          text: `${lp.label}: ${lp.rationale} (strength: ${lp.strength})`,
          citation: { kind: "ecosystem", provenance: lp.provenance },
        })),
      },
    ],
  };

  const clauseLookup = new Map<number, ClauseLintRecord>(
    allClauses.map((c) => [
      c.id,
      {
        documentId: c.documentId,
        spanStart: c.spanStart,
        spanEnd: c.spanEnd,
        excerptText: c.excerptText,
        status: c.status as ClauseLintRecord["status"],
      },
    ]),
  );

  const lintReport = lintDossier(content, {
    clauseLookup,
    contractIds: new Set(contractIds),
    obligationIds: new Set(allObligations.map((o) => o.id)),
  });

  const [row] = await db
    .insert(dossiers)
    .values({
      counterpartyPartyId,
      content,
      citationsValid: lintReport.passed,
      lintReport,
      status: lintReport.passed ? "ready" : "lint_failed",
      accessTier: "deal_team_only",
    })
    .returning();

  return { dossier: row, lintReport };
}
