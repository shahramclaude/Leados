"use server";

import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { buildConformityBundle, validateConformityBundle, type ConformityFrame } from "@/lib/accountability/conformity";

export async function generateExportAction(formData: FormData) {
  const frame = String(formData.get("frame")) as ConformityFrame;

  const bundle = await buildConformityBundle(frame);
  const validation = validateConformityBundle(bundle);
  if (!validation.success) {
    redirect(`/accountability/conformity?error=${encodeURIComponent("Bundle failed schema validation — export aborted.")}`);
  }

  const exportsDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const fileName = `conformity-bundle-${frame}-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path.join(exportsDir, fileName), JSON.stringify(bundle, null, 2), "utf8");

  redirect(`/accountability/conformity?generated=${encodeURIComponent(fileName)}`);
}
