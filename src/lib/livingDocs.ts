// src/lib/livingDocs.ts
//
// Strategy docs, playbooks and policies that render from live data blocks.
// A doc is a list of content blocks; `text` blocks are static authored
// prose, `metric` blocks re-resolve to the current value of a metric every
// time the doc is rendered, and `finding` blocks re-resolve to the current
// (decayed) confidence + lesson of a retrospective. Version history stores
// the block source + a point-in-time rendered snapshot; `renderLive` always
// re-resolves against current data so the document is never stale.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { livingDocs, livingDocVersions, metricValues, metrics, retrospectives } from "@/db/schema";
import { diffLines, type DiffLine } from "@/lib/narrativeIntel";
import { indexDocument } from "@/lib/search";

export type DocBlock =
  | { type: "text"; content: string }
  | { type: "metric"; metricKey: string; label?: string }
  | { type: "finding"; retrospectiveId: number };

export interface CreateLivingDocInput {
  slug: string;
  title: string;
  docType?: "strategy" | "playbook" | "policy" | "whitepaper";
}

export async function createLivingDoc(input: CreateLivingDocInput) {
  const [row] = await db
    .insert(livingDocs)
    .values({ slug: input.slug, title: input.title, docType: input.docType ?? "strategy" })
    .onConflictDoNothing({ target: livingDocs.slug })
    .returning();
  if (row) return row;
  const [existing] = await db.select().from(livingDocs).where(eq(livingDocs.slug, input.slug)).limit(1);
  return existing;
}

/** Resolve one block against current live data. */
async function renderBlock(block: DocBlock): Promise<string> {
  if (block.type === "text") return block.content;
  if (block.type === "metric") {
    const [latest] = await db
      .select()
      .from(metricValues)
      .where(eq(metricValues.metricKey, block.metricKey))
      .orderBy(desc(metricValues.recordedAt))
      .limit(1);
    const [def] = await db.select().from(metrics).where(eq(metrics.key, block.metricKey)).limit(1);
    const label = block.label ?? def?.label ?? block.metricKey;
    if (!latest) return `**${label}**: no data yet`;
    return `**${label}**: ${latest.value}${def?.unit ? ` ${def.unit}` : ""} _(as of ${latest.recordedAt.toISOString().slice(0, 10)})_`;
  }
  if (block.type === "finding") {
    const [retro] = await db.select().from(retrospectives).where(eq(retrospectives.id, block.retrospectiveId)).limit(1);
    if (!retro) return `_Finding #${block.retrospectiveId} not found_`;
    return `**${retro.title}** — ${retro.lesson}`;
  }
  return "";
}

export async function renderBlocks(blocks: DocBlock[]): Promise<string> {
  const rendered = await Promise.all(blocks.map(renderBlock));
  return rendered.join("\n\n");
}

export interface AddVersionInput {
  slug: string;
  blocks: DocBlock[];
  authorName: string;
  changeNote?: string;
}

export async function addVersion(input: AddVersionInput) {
  const [doc] = await db.select().from(livingDocs).where(eq(livingDocs.slug, input.slug)).limit(1);
  if (!doc) throw new Error(`Living doc "${input.slug}" not found`);
  const nextVersion = doc.currentVersion + 1;
  const renderedContent = await renderBlocks(input.blocks);
  const [version] = await db
    .insert(livingDocVersions)
    .values({
      docId: doc.id,
      version: nextVersion,
      blocks: input.blocks,
      renderedContent,
      authorName: input.authorName,
      changeNote: input.changeNote ?? null,
    })
    .returning();
  await db
    .update(livingDocs)
    .set({ currentVersion: nextVersion, status: "draft", updatedAt: new Date() })
    .where(eq(livingDocs.id, doc.id));
  await indexDocument({
    sourceType: "living_doc",
    sourceId: doc.id,
    title: doc.title,
    body: renderedContent,
    tags: [doc.docType],
    recencyAt: new Date(),
  });
  return version;
}

export async function getDoc(slug: string) {
  const [doc] = await db.select().from(livingDocs).where(eq(livingDocs.slug, slug)).limit(1);
  if (!doc) return null;
  const versions = await db
    .select()
    .from(livingDocVersions)
    .where(eq(livingDocVersions.docId, doc.id))
    .orderBy(desc(livingDocVersions.version));
  return { doc, versions };
}

/** Re-resolve the current version's blocks against live data right now (never returns a stale snapshot). */
export async function renderLive(slug: string): Promise<string | null> {
  const result = await getDoc(slug);
  if (!result || result.versions.length === 0) return null;
  const latest = result.versions[0];
  return renderBlocks(latest.blocks as DocBlock[]);
}

export async function diffVersions(slug: string, versionA: number, versionB: number): Promise<DiffLine[]> {
  const result = await getDoc(slug);
  if (!result) throw new Error(`Living doc "${slug}" not found`);
  const a = result.versions.find((v) => v.version === versionA);
  const b = result.versions.find((v) => v.version === versionB);
  if (!a || !b) throw new Error(`Version not found for diff: ${versionA} vs ${versionB}`);
  return diffLines(a.renderedContent, b.renderedContent);
}

export async function approveVersion(slug: string, version: number, approvedBy: string) {
  const result = await getDoc(slug);
  if (!result) throw new Error(`Living doc "${slug}" not found`);
  const target = result.versions.find((v) => v.version === version);
  if (!target) throw new Error(`Version ${version} not found`);
  await db
    .update(livingDocVersions)
    .set({ approvedBy, approvedAt: new Date() })
    .where(and(eq(livingDocVersions.docId, result.doc.id), eq(livingDocVersions.version, version)));
  if (result.doc.currentVersion === version) {
    await db.update(livingDocs).set({ status: "approved", updatedAt: new Date() }).where(eq(livingDocs.id, result.doc.id));
  }
  return { ok: true };
}

/** Export the live-rendered current version as Markdown (the only export format needed today; trivial to add PDF/HTML later). */
export async function exportDoc(slug: string): Promise<{ title: string; markdown: string } | null> {
  const result = await getDoc(slug);
  if (!result || result.versions.length === 0) return null;
  const content = await renderLive(slug);
  return { title: result.doc.title, markdown: `# ${result.doc.title}\n\n${content ?? ""}` };
}

export async function listLivingDocs() {
  return db.select().from(livingDocs).orderBy(desc(livingDocs.updatedAt));
}
