import { useMemo, useState } from "react";
import { ORG_DATASETS } from "../../lib/domainData";
import { QUESTION_ONTOLOGY, questionById } from "../../lib/questionOntology";
import { BOARD_PACK_DEFAULT_ORDER, compileBoardPack } from "../../lib/briefingCompiler";
import { freezePack, latestVersion, type PackHistory } from "../../lib/snapshot";
import { generateSlideDeck } from "../../lib/slideGenerator";
import { BRAND_THEMES, type BrandTheme } from "../../lib/exporters/brandTheme";
import { exportBoardPackPdf, downloadPdf } from "../../lib/exporters/pdfExport";
import { exportSlideDeck, downloadBlob } from "../../lib/exporters/pptxExport";
import { EvidenceDrawer } from "../shared/EvidenceDrawer";
import type { Fact } from "../../lib/citations";
import { SlideDeckViewer } from "./SlideDeckViewer";

const BOARD_ELIGIBLE_IDS = QUESTION_ONTOLOGY.map((q) => q.id);

export function BoardPackStudio({ onNavigate }: { onNavigate: (sourceView: string) => void }) {
  const [orgId, setOrgId] = useState<keyof typeof ORG_DATASETS>("northwind");
  const ds = ORG_DATASETS[orgId];
  const [sectionOrder, setSectionOrder] = useState<string[]>(BOARD_PACK_DEFAULT_ORDER);
  const [theme, setTheme] = useState<BrandTheme>(BRAND_THEMES[0]);
  const [history, setHistory] = useState<PackHistory | null>(null);
  const [openFactId, setOpenFactId] = useState<number | null>(null);
  const [tab, setTab] = useState<"sections" | "deck">("sections");
  const [exporting, setExporting] = useState<string | null>(null);

  const pack = useMemo(() => compileBoardPack(ds, sectionOrder), [ds, sectionOrder]);
  const facts: Fact[] = pack.ledger.all();
  const openFact = openFactId !== null ? facts.find((f) => f.id === openFactId) ?? null : null;
  const deck = useMemo(() => generateSlideDeck(pack), [pack]);
  const current = latestVersion(history);

  function moveSection(index: number, dir: -1 | 1) {
    setSectionOrder((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleSection(id: string) {
    setSectionOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function freeze() {
    setHistory((prev) => freezePack(prev, pack, "You (board pack reviewer)"));
  }

  async function doExportPdf() {
    setExporting("pdf");
    try {
      const source = current ? current.pack : pack;
      const versionLabel = current ? `Version ${current.version} (frozen ${new Date(current.frozenAt).toLocaleString()})` : "Unfrozen draft";
      const doc = exportBoardPackPdf(source, theme, versionLabel);
      downloadPdf(doc, `${pack.orgId}-board-pack-v${current?.version ?? "draft"}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  async function doExportSlides() {
    setExporting("pptx");
    try {
      const source = current ? generateSlideDeck(current.pack) : deck;
      const blob = await exportSlideDeck(source, theme);
      downloadBlob(blob, `${pack.orgId}-board-pack-v${current?.version ?? "draft"}.pptx`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LEADOS · Board Pack Studio</p>
          <h1 className="text-2xl font-bold text-slate-900">{pack.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{ds.label} · {pack.wordCount} words · ~{pack.estReadMinutes} min read</p>
        </div>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value as keyof typeof ORG_DATASETS)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {Object.values(ORG_DATASETS).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </header>

      {/* Lint status strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LintCard label="Citation lint" ok={pack.citationIssues.length === 0} detail={`${pack.citationIssues.length} issue(s)`} />
        <LintCard label="Zero-filler lint" ok={pack.zeroFillerLint.passed} detail={`${pack.zeroFillerLint.errors.length} issue(s)`} />
        <LintCard label="Speech-ready lint" ok={pack.speechLint.passed} detail={`${pack.speechLint.errors.length} issue(s)`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Template / section ordering */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Template & section ordering</p>
          <ul className="space-y-1.5">
            {sectionOrder.map((id, i) => (
              <li key={id} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <span className="truncate text-slate-700">{questionById(id)?.shortLabel ?? id}</span>
                <div className="flex gap-1">
                  <button onClick={() => moveSection(i, -1)} className="rounded px-1.5 text-slate-500 hover:bg-slate-100">↑</button>
                  <button onClick={() => moveSection(i, 1)} className="rounded px-1.5 text-slate-500 hover:bg-slate-100">↓</button>
                  <button onClick={() => toggleSection(id)} className="rounded px-1.5 text-rose-500 hover:bg-rose-50">✕</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] uppercase tracking-wide text-slate-400">Add a section</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {BOARD_ELIGIBLE_IDS.filter((id) => !sectionOrder.includes(id)).map((id) => (
              <button key={id} onClick={() => toggleSection(id)} className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                + {questionById(id)?.shortLabel ?? id}
              </button>
            ))}
          </div>

          <p className="mb-1 mt-4 text-[11px] uppercase tracking-wide text-slate-400">Brand theme</p>
          <select value={theme.name} onChange={(e) => setTheme(BRAND_THEMES.find((t) => t.name === e.target.value) ?? BRAND_THEMES[0])} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {BRAND_THEMES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>

          <div className="mt-4 space-y-2">
            <button onClick={freeze} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              ❄️ Freeze numbers → version {nextVersionLabel(current, pack)}
            </button>
            <button disabled={exporting !== null} onClick={doExportPdf} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {exporting === "pdf" ? "Exporting…" : "⬇ Export PDF"}
            </button>
            <button disabled={exporting !== null} onClick={doExportSlides} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {exporting === "pptx" ? "Exporting…" : "⬇ Export Slides (.pptx)"}
            </button>
          </div>
        </section>

        {/* Version history / numbers freeze */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Version history (numbers freeze)</p>
          {!history || history.versions.length === 0 ? (
            <p className="text-sm text-slate-500">No frozen version yet. Freeze to lock today's numbers — a later source-data change will never silently alter this version.</p>
          ) : (
            <ul className="space-y-2">
              {[...history.versions].reverse().map((v) => (
                <li key={v.version} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Version {v.version}</span>
                    <span className="text-slate-400">{new Date(v.frozenAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-0.5 text-slate-500">fingerprint {v.fingerprint}</p>
                  {v.diffFromPrevious && v.diffFromPrevious.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {v.diffFromPrevious.map((d) => (
                        <li key={d.factId} className="text-amber-700">
                          #{d.factId} {d.label}: {d.before} → {d.after}
                        </li>
                      ))}
                    </ul>
                  ) : v.diffFromPrevious ? (
                    <p className="mt-1 text-slate-400">No numeric changes vs previous version.</p>
                  ) : (
                    <p className="mt-1 text-slate-400">Baseline version.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reading pane */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={() => setTab("sections")} className={`rounded-full px-2.5 py-1 ${tab === "sections" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>Narrative</button>
            <button onClick={() => setTab("deck")} className={`rounded-full px-2.5 py-1 ${tab === "deck" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>Slide deck</button>
          </div>
          {tab === "sections" ? (
            <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
              {pack.sections.map((s) => (
                <div key={s.heading}>
                  <p className="text-sm font-semibold text-slate-900">{s.heading}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {s.sentences.map((sent, i) => (
                      <span key={i}>
                        {sent.text}{" "}
                        {sent.refs.map((r) => (
                          <button key={r} onClick={() => setOpenFactId(r)} className="mr-0.5 rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100">[{r}]</button>
                        ))}{" "}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <SlideDeckViewer deck={deck} onFootnoteClick={setOpenFactId} />
          )}
        </section>
      </div>

      <EvidenceDrawer fact={openFact} onClose={() => setOpenFactId(null)} onJumpToSource={onNavigate} />
    </div>
  );
}

function nextVersionLabel(current: ReturnType<typeof latestVersion>, pack: ReturnType<typeof compileBoardPack>): number {
  if (!current) return 1;
  return current.fingerprint === pack.ledger.fingerprint() ? current.version : current.version + 1;
}

function LintCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={`rounded-xl border p-3 text-sm ${ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <p className="font-semibold text-slate-800">{label}</p>
      <p className={ok ? "text-emerald-700" : "text-rose-700"}>{ok ? "PASS" : "FAIL"} · {detail}</p>
    </div>
  );
}
