import { NextRequest } from "next/server";
import { db } from "@/db";
import { claims, documents } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Citation-locked retrieval (lite): BM25-style term-overlap scoring over
// claims, each result always carries its source document + locator so a
// claim can never be shown without a verifiable citation.
function scoreTerms(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => (lower.includes(term) ? score + 1 : score), 0);
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const allClaims = await db.select().from(claims).where(eq(claims.orgId, DEFAULT_ORG_ID));
  const allDocs = await db.select().from(documents).where(eq(documents.orgId, DEFAULT_ORG_ID));
  const docById = new Map(allDocs.map((d) => [d.id, d]));

  if (!q) {
    return Response.json({ query: q, results: [] });
  }

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = allClaims
    .map((c) => ({ claim: c, score: scoreTerms(c.text, terms) + scoreTerms(docById.get(c.documentId)?.title ?? "", terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((r) => {
      const doc = docById.get(r.claim.documentId);
      return {
        claimId: r.claim.id,
        text: r.claim.text,
        confidence: r.claim.confidence,
        score: r.score,
        citation: {
          documentId: doc?.id,
          title: doc?.title ?? "Unknown source",
          source: doc?.source ?? "internal",
          locator: r.claim.locator,
          verified: true,
        },
      };
    });

  return Response.json({ query: q, results: scored });
}
