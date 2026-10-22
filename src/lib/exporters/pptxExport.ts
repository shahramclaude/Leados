// =============================================================================
// Part 32 — export engine, slides (Phase 3c).
// =============================================================================
// LIBRARY CHOICE, JUSTIFIED: `PptxGenJS`.
//   - Produces a REAL, editable .pptx (OOXML) — board members and ICs
//     routinely want to drop a slide into a parent deck or annotate it; an
//     image/PDF export of slides would not satisfy that, a native file does.
//   - Runs entirely client-side (same deployment constraint as the PDF
//     exporter — no headless-Chrome render farm).
//   - Maps directly onto `SlideSpec` (title, bullets, speaker notes) with no
//     templating layer in between, keeping the same "no intermediate
//     artifact that could drift from the frozen pack" guarantee.
// Each slide's speaker notes are populated from `SlideSpec.speakerNotes`
// (itself built from the same cited sentences as the slide body) and
// footnote markers are rendered on-slide as a small caption line mapping
// marker -> source view, satisfying "every slide traceable to its source
// data."
import pptxgen from "pptxgenjs";
import type { SlideDeck } from "../slideGenerator";
import type { BrandTheme } from "./brandTheme";

export async function exportSlideDeck(deck: SlideDeck, theme: BrandTheme): Promise<Blob> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "LEADOS";
  pptx.title = deck.title;

  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    s.background = { color: slide.kind === "title" ? theme.primaryHex.replace("#", "") : "FFFFFF" };

    if (slide.kind === "title") {
      s.addText(theme.logoMark, { x: 0.4, y: 0.3, fontSize: 12, color: "FFFFFF" });
      s.addText(slide.title, { x: 0.4, y: 1.4, w: 9, h: 1.2, fontSize: 32, bold: true, color: "FFFFFF" });
      s.addText(slide.oneMessage, { x: 0.4, y: 2.6, w: 9, h: 0.6, fontSize: 16, color: "E0E7FF" });
    } else {
      s.addText(slide.title, { x: 0.4, y: 0.3, w: 9.2, h: 0.6, fontSize: 22, bold: true, color: theme.inkHex.replace("#", "") });
      s.addText(slide.oneMessage, { x: 0.4, y: 0.95, w: 9.2, h: 0.5, fontSize: 15, color: theme.primaryHex.replace("#", ""), bold: true });
      if (slide.bullets.length > 0) {
        s.addText(
          slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          { x: 0.4, y: 1.55, w: 9.2, h: 3.4, fontSize: 12, color: theme.inkHex.replace("#", "") },
        );
      }
      if (slide.footnotes.length > 0) {
        const captions = slide.footnotes.map((f) => `${f.marker} ${f.label}: ${f.formatted} (${f.confidence}) -> ${f.sourceView}`).join("   ");
        s.addText(captions, { x: 0.4, y: 5.15, w: 9.2, h: 0.5, fontSize: 8, color: "6B7280", italic: true });
      }
    }
    s.addNotes(slide.speakerNotes);
  }

  return (await pptx.write({ outputType: "blob" })) as Blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
