// Citation lint for negotiation dossiers — reusing Part 08's citation-lint contract: every factual
// claim surfaced to a human must carry a resolvable citation back to its source (a confirmed clause
// span, an obligation record, a contract record, or an explicitly-provenanced ecosystem-seam fact).
// A dossier that fails lint is never marked "ready"; it is stored as `lint_failed` and the UI must say
// so rather than silently showing unverified claims (Phase 4 gate #5).

export type Citation =
  | { kind: "clause"; clauseId: number; documentId: number; spanStart: number; spanEnd: number; quote: string }
  | { kind: "obligation"; obligationId: number }
  | { kind: "contract"; contractId: number }
  | { kind: "ecosystem"; provenance: string };

export interface DossierClaim {
  text: string;
  citation: Citation;
}

export interface DossierSection {
  heading: string;
  claims: DossierClaim[];
}

export interface DossierContent {
  counterpartyName: string;
  generatedAt: string;
  disclaimer: string;
  sections: DossierSection[];
}

export interface ClauseLintRecord {
  documentId: number;
  spanStart: number;
  spanEnd: number;
  excerptText: string;
  status: "draft" | "confirmed" | "rejected";
}

export interface LintContext {
  clauseLookup: Map<number, ClauseLintRecord>;
  contractIds: Set<number>;
  obligationIds: Set<number>;
}

export interface LintIssue {
  section: string;
  claimText: string;
  reason: string;
}

export interface LintReport {
  passed: boolean;
  issues: LintIssue[];
  checkedClaims: number;
}

export function lintDossier(content: DossierContent, ctx: LintContext): LintReport {
  const issues: LintIssue[] = [];
  let checkedClaims = 0;

  for (const section of content.sections) {
    for (const claim of section.claims) {
      checkedClaims += 1;
      if (!claim.text || !claim.text.trim()) {
        issues.push({ section: section.heading, claimText: claim.text, reason: "Empty claim text" });
        continue;
      }
      if (!claim.citation) {
        issues.push({ section: section.heading, claimText: claim.text, reason: "Missing citation" });
        continue;
      }

      switch (claim.citation.kind) {
        case "clause": {
          const record = ctx.clauseLookup.get(claim.citation.clauseId);
          if (!record) {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: `Citation references unknown clauseId=${claim.citation.clauseId}`,
            });
            break;
          }
          if (record.status !== "confirmed") {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: `Citation references clauseId=${claim.citation.clauseId} which is not human-confirmed (status=${record.status})`,
            });
          }
          if (
            record.spanStart !== claim.citation.spanStart ||
            record.spanEnd !== claim.citation.spanEnd ||
            record.documentId !== claim.citation.documentId
          ) {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: `Citation span/document mismatch for clauseId=${claim.citation.clauseId}`,
            });
            break;
          }
          const expectedQuote = record.excerptText.slice(
            claim.citation.spanStart - record.spanStart,
            claim.citation.spanEnd - record.spanStart,
          );
          if (expectedQuote !== claim.citation.quote) {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: `Citation quote does not match source span for clauseId=${claim.citation.clauseId}`,
            });
          }
          break;
        }
        case "obligation": {
          if (!ctx.obligationIds.has(claim.citation.obligationId)) {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: `Citation references unknown obligationId=${claim.citation.obligationId}`,
            });
          }
          break;
        }
        case "contract": {
          if (!ctx.contractIds.has(claim.citation.contractId)) {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: `Citation references unknown contractId=${claim.citation.contractId}`,
            });
          }
          break;
        }
        case "ecosystem": {
          if (!claim.citation.provenance || !claim.citation.provenance.startsWith("seam:")) {
            issues.push({
              section: section.heading,
              claimText: claim.text,
              reason: "Ecosystem citation missing seam-tagged provenance string",
            });
          }
          break;
        }
        default:
          issues.push({ section: section.heading, claimText: claim.text, reason: "Unknown citation kind" });
      }
    }
  }

  return { passed: issues.length === 0, issues, checkedClaims };
}
