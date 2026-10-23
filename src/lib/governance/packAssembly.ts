// Board pack assembly (Part 32 pack machinery) + mandatory risk/controls
// section (Part 29) + compliance attestations + the "what the board doesn't
// see" completeness red-flag detector.

import { db } from "@/db";
import {
  boardPacks,
  packSections,
  packRedFlags,
  completenessPolicy,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";
import { MANDATORY_PACK_SECTIONS } from "./types";

export type SectionInput = {
  sectionType: string;
  title: string;
  content: string;
  required?: boolean;
  included?: boolean;
  omittedReason?: string;
  omittedPolicyRef?: string;
  sourcePart: string;
};

export async function seedDefaultCompletenessPolicy(tier = "main_board") {
  const existing = await db
    .select()
    .from(completenessPolicy)
    .where(eq(completenessPolicy.appliesToTier, tier));
  if (existing.length > 0) return existing;

  const rows = await db
    .insert(completenessPolicy)
    .values(
      MANDATORY_PACK_SECTIONS.map((sectionType) => ({
        sectionType,
        mandatory: true,
        appliesToTier: tier,
        description: `Mandatory section for ${tier} packs: ${sectionType}`,
      })),
    )
    .returning();
  return rows;
}

export async function createPack(meetingId: number) {
  const [pack] = await db
    .insert(boardPacks)
    .values({ meetingId, completenessStatus: "pending" })
    .returning();
  return pack;
}

export async function addSection(packId: number, section: SectionInput) {
  const [row] = await db
    .insert(packSections)
    .values({
      packId,
      sectionType: section.sectionType,
      title: section.title,
      content: section.content,
      required: section.required ?? false,
      included: section.included ?? true,
      omittedReason: section.omittedReason,
      omittedPolicyRef: section.omittedPolicyRef,
      sourcePart: section.sourcePart,
    })
    .returning();
  return row;
}

/** Freezes the numbers (Part 32 "numbers-freeze") at assembly time so later
 * silent edits to underlying financial data cannot alter what the board saw. */
export async function freezeNumbers(packId: number, snapshot: Record<string, unknown>) {
  const [row] = await db
    .update(boardPacks)
    .set({ numbersFrozenAt: new Date(), frozenSnapshot: snapshot })
    .where(eq(boardPacks.id, packId))
    .returning();
  return row;
}

/**
 * Completeness red-flag check — the "what the board doesn't see" detector.
 * A mandatory section that is missing entirely, or present but marked
 * `included: false` without a documented policy exception reference, or
 * present but empty, is a structural red flag raised against the pack,
 * independent of who assembled it.
 */
export async function runCompletenessCheck(packId: number, tier = "main_board") {
  const policy = await db
    .select()
    .from(completenessPolicy)
    .where(eq(completenessPolicy.appliesToTier, tier));

  const sections = await db
    .select()
    .from(packSections)
    .where(eq(packSections.packId, packId));

  const flags: Array<{ sectionType: string; flagType: string; detail: string }> = [];

  for (const rule of policy.filter((p) => p.mandatory)) {
    const match = sections.find((s) => s.sectionType === rule.sectionType);

    if (!match) {
      flags.push({
        sectionType: rule.sectionType,
        flagType: "missing_mandatory",
        detail: `Mandatory section "${rule.sectionType}" was not assembled into the pack at all.`,
      });
      continue;
    }

    if (!match.included) {
      if (!match.omittedPolicyRef) {
        flags.push({
          sectionType: rule.sectionType,
          flagType: "omitted_without_policy",
          detail: `Mandatory section "${rule.sectionType}" was marked omitted with reason "${
            match.omittedReason ?? "(none given)"
          }" but cites no documented policy exception. This is treated as material suppressed against policy.`,
        });
      }
      continue;
    }

    if (!match.content || match.content.trim().length === 0) {
      flags.push({
        sectionType: rule.sectionType,
        flagType: "empty_content",
        detail: `Mandatory section "${rule.sectionType}" is present but empty.`,
      });
    }
  }

  // Clear previously-raised, now-resolved flags is out of scope here; we
  // just insert fresh flags for this assembly pass.
  const inserted = [];
  for (const flag of flags) {
    const [row] = await db
      .insert(packRedFlags)
      .values({
        packId,
        sectionType: flag.sectionType,
        flagType: flag.flagType,
        detail: flag.detail,
      })
      .returning();
    inserted.push(row);
  }

  const completenessStatus = inserted.length > 0 ? "red_flag" : "complete";
  const [pack] = await db
    .update(boardPacks)
    .set({ completenessStatus, assembledAt: new Date() })
    .where(eq(boardPacks.id, packId))
    .returning();

  await appendAuditEntry({
    action: "board_pack.completeness_checked",
    entityType: "board_pack",
    entityId: packId,
    payload: { flagCount: inserted.length, completenessStatus },
  });

  return { pack, flags: inserted };
}

export async function getPackWithSections(packId: number) {
  const [pack] = await db.select().from(boardPacks).where(eq(boardPacks.id, packId));
  if (!pack) return null;
  const sections = await db
    .select()
    .from(packSections)
    .where(eq(packSections.packId, packId));
  const flags = await db
    .select()
    .from(packRedFlags)
    .where(eq(packRedFlags.packId, packId));
  return { pack, sections, flags };
}
