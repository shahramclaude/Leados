import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_FRAMES, validateConformityBundle, type ConformityBundle } from "@/lib/accountability/conformity";
import { generateExportAction } from "./actions";

export const dynamic = "force-dynamic";

interface ExportFileInfo {
  fileName: string;
  mtimeMs: number;
  frame: string;
  generatedAt: string;
  gapsCount: number;
  valid: boolean;
}

function readExportFiles(): ExportFileInfo[] {
  const exportsDir = path.join(process.cwd(), "exports");
  if (!fs.existsSync(exportsDir)) return [];

  return fs
    .readdirSync(exportsDir)
    .filter((f) => f.endsWith(".json"))
    .map((fileName) => {
      const fullPath = path.join(exportsDir, fileName);
      const stat = fs.statSync(fullPath);
      let bundle: ConformityBundle | null = null;
      let valid = false;
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        const validation = validateConformityBundle(parsed);
        valid = validation.success;
        bundle = validation.success ? (parsed as ConformityBundle) : null;
      } catch {
        valid = false;
      }
      return {
        fileName,
        mtimeMs: stat.mtimeMs,
        frame: bundle?.scope.frame ?? "unknown",
        generatedAt: bundle?.generatedAt ?? "unknown",
        gapsCount: bundle?.gaps.length ?? -1,
        valid,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export default async function ConformityExportPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const files = readExportFiles();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Conformity Export</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        One command produces a schema-validated evidence bundle: registry, impact assessments, monitoring results
        (Part 38), fairness reports (Part 09) and audit chain slices (Part 19) — for an explicitly named scope. Run{" "}
        <code className="rounded bg-slate-100 px-1">npm run conformity:export -- --frame=&lt;frame&gt;</code> from the
        command line, or generate one below.
      </p>

      {sp.generated ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Generated <span className="font-mono">{sp.generated}</span>.
        </p>
      ) : null}
      {sp.error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800">{sp.error}</p> : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Generate a new bundle</h2>
        <form action={generateExportAction} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-slate-600">
            Scope / frame (must be named explicitly — never unscoped &ldquo;compliant&rdquo;)
            <select name="frame" className="mt-1 w-96 rounded-md border border-slate-300 px-2 py-1 text-sm">
              {SUPPORTED_FRAMES.map((frame) => (
                <option key={frame} value={frame}>
                  {frame}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
            Generate bundle
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Generated bundles</h2>
        {files.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No bundles generated yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {files.map((file) => (
              <li key={file.fileName} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <div className="font-mono text-xs text-slate-700">{file.fileName}</div>
                  <div className="text-xs text-slate-500">
                    frame: {file.frame} · gaps listed: {file.gapsCount >= 0 ? file.gapsCount : "n/a"} · schema valid:{" "}
                    {file.valid ? "yes" : "no"}
                  </div>
                </div>
                <a
                  href={`/api/accountability/conformity/download?file=${encodeURIComponent(file.fileName)}`}
                  className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
                >
                  Download JSON
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="font-semibold">What this export does NOT prove</h2>
        <p className="mt-2">
          Every bundle embeds an explicit <code>scope.notCertified</code> list. No frame produced here constitutes an
          external regulator&rsquo;s or certification body&rsquo;s sign-off, and the &ldquo;EU-AI-Act-style&rdquo; frame is a LEADOS
          internal stylistic mapping only, not a legal conformity assessment.
        </p>
      </section>
    </main>
  );
}
