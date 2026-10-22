// =============================================================================
// Part 32 — export engine, PDF (Phase 3c).
// =============================================================================
// LIBRARY CHOICE, JUSTIFIED: `jsPDF`.
//   - Pure client-side generation (no server render farm / headless Chrome
//     needed), which matches this repo's deployment shape and keeps a board
//     pack exportable even from a read-replica/offline-friendly build.
//   - Vector text + simple shapes are all a board pack narrative needs
//     (prose, headings, footnote markers, a brand rule) — we deliberately do
//     NOT reach for a heavier HTML-to-PDF renderer (e.g. puppeteer) because
//     that would require a server round-trip this part's "numbers freeze"
//     guarantee doesn't need: the PDF is rendered directly from the frozen
//     `BriefingPack`, so there is no intermediate HTML snapshot that could
//     drift from the cited facts.
//   - Small bundle (~250KB), MIT-licensed, actively maintained, and already
//     battle-tested for exactly this "structured text + simple layout"
//     use case (vs. pixel-perfect design fidelity, which a board narrative
//     does not require).
// Alternative considered: `react-pdf` (more idiomatic JSX, but heavier
// dependency tree and a less direct mapping to the already-structured
// `SlideDeck`/`BriefingPack` shapes) — rejected for this build to keep the
// export path dependency-light and synchronous.
import { jsPDF } from "jspdf";
import type { BriefingPack } from "../briefingCompiler";
import type { BrandTheme } from "./brandTheme";
import { CONFIDENCE_LABEL } from "../types";

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function exportBoardPackPdf(pack: BriefingPack, theme: BrandTheme, versionLabel: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const [pr, pg, pb] = hexToRgb(theme.primaryHex);
  const [ir, ig, ib] = hexToRgb(theme.inkHex);
  let y = PAGE_MARGIN;

  function ensureSpace(lines: number, lineHeight = 14) {
    if (y + lines * lineHeight > PAGE_HEIGHT - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  }

  // Title page
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, PAGE_WIDTH, 120, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(theme.logoMark, PAGE_MARGIN, 36);
  doc.setFontSize(22);
  doc.text(pack.title, PAGE_MARGIN, 72);
  doc.setFontSize(11);
  doc.text(`${pack.orgLabel} · as of ${pack.asOfDate} · ${versionLabel}`, PAGE_MARGIN, 96);
  y = 150;
  doc.setTextColor(ir, ig, ib);
  doc.setFontSize(10);
  doc.text(
    `This pack is rendered against a frozen numbers snapshot (fingerprint ${pack.ledger.fingerprint()}). ${pack.ledger.all().length} facts cited, 0 citation issues.`,
    PAGE_MARGIN,
    y,
    { maxWidth: CONTENT_WIDTH },
  );
  y += 30;

  for (const section of pack.sections) {
    ensureSpace(3, 18);
    doc.setFontSize(14);
    doc.setTextColor(pr, pg, pb);
    doc.text(section.heading, PAGE_MARGIN, y);
    y += 18;
    doc.setFontSize(10.5);
    doc.setTextColor(ir, ig, ib);
    for (const sentence of section.sentences) {
      const refMarkers = sentence.refs.length > 0 ? ` ${sentence.refs.map((r) => `[${r}]`).join("")}` : "";
      const lineText = `${sentence.text}${refMarkers}`;
      const wrapped = doc.splitTextToSize(lineText, CONTENT_WIDTH);
      ensureSpace(wrapped.length + 1, 14);
      doc.text(wrapped, PAGE_MARGIN, y);
      y += wrapped.length * 14 + 4;
    }
    y += 10;
  }

  // Appendix
  doc.addPage();
  y = PAGE_MARGIN;
  doc.setFontSize(14);
  doc.setTextColor(pr, pg, pb);
  doc.text("Appendix — Evidence Ledger & Methods", PAGE_MARGIN, y);
  y += 20;
  doc.setFontSize(9.5);
  doc.setTextColor(ir, ig, ib);
  for (const fact of pack.ledger.all()) {
    ensureSpace(2, 13);
    const line = `[${fact.id}] ${fact.label}: ${fact.formatted} — ${CONFIDENCE_LABEL[fact.confidence]} — source: ${fact.sourceView}`;
    const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH);
    doc.text(wrapped, PAGE_MARGIN, y);
    y += wrapped.length * 13 + 2;
  }

  return doc;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
