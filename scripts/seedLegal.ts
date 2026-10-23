// `npm run seed:legal` — populates demo data for the Contract Vault / Obligation Board / Counterparty
// Dossiers / Renewal Calendar surfaces: parties, controls, documents (through the quarantine seam),
// contracts, extracted draft clauses, a human-confirmation pass on a realistic subset, generated
// obligations, compliance mapping rows, a change-of-control cascade fixture, one compiled dossier, and
// the full eval:legal labeled corpus (for Vault provenance / traceability).
//
// Idempotent-ish: safe to re-run against a fresh database; does not attempt to dedupe against a
// partially-seeded one.

import "dotenv/config";
import { db } from "../src/db";
import {
  cascadeTriggers,
  complianceMappings,
  contracts,
  controls,
  evalAnnotations,
  evalDocuments,
  obligations as obligationsTable,
  parties,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { ingestDocument, runExtractionForDocument } from "../src/lib/legal/ingestion";
import { confirmClause } from "../src/lib/legal/obligationGate";
import { generateObligationFromClause } from "../src/lib/legal/obligationGenerator";
import { confirmObligation, commitObligation } from "../src/lib/legal/obligationGate";
import { COMPLIANCE_MAPPING_SEED } from "../src/lib/legal/complianceMapping";
import { generateCorpus } from "../src/lib/legal/corpus";
import { runChangeOfControlCascade } from "../src/lib/legal/cascade";
import { compileDossier } from "../src/lib/legal/dossier";

const SAMPLE_CONTRACTS: Array<{
  title: string;
  counterparty: string;
  jurisdiction: string;
  governingLaw: string;
  effectiveMonthsAgo: number;
  termMonths: number;
  renewalWindowDays: number;
  terminationNoticeDays: number;
  clauses: string[];
}> = [
  {
    title: "Master Services Agreement — Caldera Data Systems",
    counterparty: "Caldera Data Systems",
    jurisdiction: "US-DE",
    governingLaw: "US-DE",
    effectiveMonthsAgo: 10,
    termMonths: 12,
    renewalWindowDays: 60,
    terminationNoticeDays: 30,
    clauses: ["term", "renewal", "termination", "sla", "indemnity", "liability_cap", "change_of_control", "data_protection"],
  },
  {
    title: "Data Processing & Hosting Agreement — Vertex Cloud Partners",
    counterparty: "Vertex Cloud Partners",
    jurisdiction: "EU",
    governingLaw: "EU",
    effectiveMonthsAgo: 4,
    termMonths: 24,
    renewalWindowDays: 90,
    terminationNoticeDays: 60,
    clauses: ["term", "renewal", "sla", "indemnity", "data_protection", "change_of_control"],
  },
  {
    title: "Supply & Logistics Agreement — Brightline Logistics",
    counterparty: "Brightline Logistics",
    jurisdiction: "US-CA",
    governingLaw: "US-CA",
    effectiveMonthsAgo: 22,
    termMonths: 12,
    renewalWindowDays: 45,
    terminationNoticeDays: 30,
    clauses: ["term", "renewal", "termination", "liability_cap", "indemnity"],
  },
];

const CLAUSE_TEXT: Record<string, string> = {
  term:
    'The initial term of this Agreement shall commence on the Effective Date and continue for 12 months (the "Initial Term"), unless earlier terminated as provided herein.',
  renewal:
    "This Agreement shall automatically renew for successive twelve (12) month periods unless either party provides written notice of non-renewal at least 60 days prior to the end of the then-current term.",
  termination:
    "Either party may terminate this Agreement for convenience upon 30 days' prior written notice to the other party.",
  sla: "Vendor shall maintain a Service Level of 99.9% monthly uptime for the Service, measured in accordance with Exhibit B, and shall issue Service Credits for any shortfall.",
  indemnity:
    "Each party shall indemnify, defend, and hold harmless the other party from and against any third-party claims arising out of its gross negligence or willful misconduct.",
  liability_cap:
    "In no event shall either party's total liability under this Agreement exceed the total fees paid in the 12 months preceding the claim.",
  change_of_control:
    "In the event of a Change of Control of either party, the other party may terminate this Agreement upon 30 days' written notice.",
  data_protection:
    "Each party shall implement appropriate technical and organizational measures to protect Personal Data in accordance with applicable data protection law, including the GDPR where applicable.",
};

async function main() {
  console.log("Seeding legal intelligence demo data...");

  const [leadosInternal] = await db
    .insert(parties)
    .values({ name: "LEADOS Legal Ops", partyType: "internal_owner", jurisdiction: "US-DE" })
    .returning();

  const [controlSOC2] = await db
    .insert(controls)
    .values({
      name: "Vendor SLA Monitoring",
      framework: "Internal Vendor Risk",
      description: "Quarterly review of vendor SLA attainment and service credits.",
      obligationTrackerRef: "part29-control-sla-001",
    })
    .returning();
  const [controlGDPR] = await db
    .insert(controls)
    .values({
      name: "Processor DPA Review",
      framework: "GDPR-Art28",
      description: "Annual confirmation that processor technical/organizational measures remain adequate.",
      obligationTrackerRef: "part29-control-dpa-001",
    })
    .returning();

  for (const sample of SAMPLE_CONTRACTS) {
    const [counterparty] = await db
      .insert(parties)
      .values({
        name: sample.counterparty,
        partyType: "counterparty",
        jurisdiction: sample.jurisdiction,
        ecosystemNodeId: `node-${sample.counterparty.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      })
      .returning();

    const rawText = [
      `MASTER SERVICES AGREEMENT between LEADOS Example Holdings Inc. and ${sample.counterparty}.`,
      ...sample.clauses.map((c) => CLAUSE_TEXT[c]),
      "This Agreement constitutes the entire understanding between the parties as to its subject matter.",
    ].join("\n\n");

    const doc = await ingestDocument({
      title: sample.title,
      sourceType: "upload",
      rawText,
      quarantineOutcome: "clean",
    });

    const effectiveDate = new Date();
    effectiveDate.setUTCMonth(effectiveDate.getUTCMonth() - sample.effectiveMonthsAgo);

    const [contract] = await db
      .insert(contracts)
      .values({
        documentId: doc.id,
        title: sample.title,
        counterpartyPartyId: counterparty.id,
        internalOwnerPartyId: leadosInternal.id,
        status: "active",
        effectiveDate,
        termMonths: sample.termMonths,
        renewalWindowDays: sample.renewalWindowDays,
        terminationNoticeDays: sample.terminationNoticeDays,
        governingLaw: sample.governingLaw,
        autoRenews: true,
      })
      .returning();

    const draftClauses = await runExtractionForDocument(doc.id, contract.id);
    console.log(`  ${sample.title}: extracted ${draftClauses.length} draft clause(s)`);

    // Simulate a human legal reviewer confirming every extracted clause for this seed demo (in
    // production this is a manual UI action per clause — see /legal/vault).
    for (const clause of draftClauses) {
      const confirmed = await confirmClause(clause.id, "seed-reviewer@leados.example");
      const obligation = await generateObligationFromClause(confirmed!.id);
      const confirmedObligation = await confirmObligation(obligation.id, "seed-reviewer@leados.example");

      if (clause.clauseType === "sla") {
        await db.update(obligationsTable).set({ controlId: controlSOC2.id }).where(eq(obligationsTable.id, confirmedObligation.id));
      } else if (clause.clauseType === "data_protection") {
        await db.update(obligationsTable).set({ controlId: controlGDPR.id }).where(eq(obligationsTable.id, confirmedObligation.id));
      }

      if (confirmedObligation.severity !== "critical") {
        // Leave change-of-control obligations as confirmed-but-not-committed to show the lifecycle
        // distinction on the Obligation Board; commit everything else to 'active'.
        await commitObligation(confirmedObligation.id);
      }
    }
  }

  // Compliance mapping table (documented, revisable provenance).
  await db.insert(complianceMappings).values(
    COMPLIANCE_MAPPING_SEED.map((m) => ({
      clauseType: m.clauseType,
      jurisdiction: m.jurisdiction,
      regulatoryObligation: m.regulatoryObligation,
      provenanceNote: m.provenanceNote,
      documentedBy: m.documentedBy,
      revisable: m.revisable,
    })),
  );

  // Change-of-control cascade fixture (Part 54 seam): a planned M&A event.
  const [trigger] = await db
    .insert(cascadeTriggers)
    .values({
      name: "Planned acquisition of LEADOS Example Holdings Inc. by Northbridge Capital",
      triggerType: "change_of_control",
      description: "Hypothetical planned M&A event used to exercise cascade analysis (seam to Part 54).",
      sourceSeam: "part54_ma_planning",
      externalEventRef: "part54-event-demo-001",
    })
    .returning();
  const impacts = await runChangeOfControlCascade(trigger.id);
  console.log(`  cascade trigger "${trigger.name}": ${impacts.length} contract(s) impacted`);

  // Negotiation dossier for the first counterparty.
  const [firstCounterparty] = await db
    .select()
    .from(parties)
    .where(eq(parties.partyType, "counterparty"))
    .limit(1);
  if (firstCounterparty) {
    const { dossier, lintReport } = await compileDossier(firstCounterparty.id);
    console.log(
      `  compiled dossier #${dossier!.id} for ${firstCounterparty.name}: status=${dossier!.status} (lint issues=${lintReport.issues.length})`,
    );
  }

  // eval:legal labeled corpus persisted for Vault provenance/traceability (the eval gate itself runs
  // purely in-memory via scripts/evalLegal.ts and does not require the DB).
  const corpus = generateCorpus();
  for (const doc of corpus) {
    const [row] = await db
      .insert(evalDocuments)
      .values({ docKey: doc.docKey, splitSet: doc.splitSet, rawText: doc.rawText })
      .returning();
    if (doc.annotations.length) {
      await db.insert(evalAnnotations).values(
        doc.annotations.map((a) => ({
          evalDocumentId: row.id,
          clauseType: a.clauseType,
          spanStart: a.spanStart,
          spanEnd: a.spanEnd,
          excerptText: a.excerptText,
        })),
      );
    }
  }
  console.log(`  persisted eval:legal corpus: ${corpus.length} documents`);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
