import type { Metadata } from "next";
import { ColorTokens } from "./ColorTokens";
import { TypeSpaceMotion } from "./TypeSpaceMotion";
import { PrimitivesSection } from "./PrimitivesSection";
import { DataSection } from "./DataSection";
import { ViewportFrames } from "./ViewportFrames";

export const metadata: Metadata = {
  title: "Styleguide — LEADOS",
};

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 border-t border-[var(--border-subtle)] py-10 first:border-0 first:pt-0">
      <h2 id={`${id}-heading`} className="text-[var(--text-xl)] font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {intro && <p className="measure mt-2 text-[var(--text-base)] text-[var(--text-secondary)]">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

const TOC = [
  { id: "tokens", label: "Color tokens" },
  { id: "type-space-motion", label: "Type / space / motion" },
  { id: "primitives", label: "UI primitives" },
  { id: "data", label: "Data & insight components" },
  { id: "viewports", label: "360 / 1440 composite" },
];

export default function StyleguidePage() {
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-10">
      <aside className="sticky top-16 hidden h-fit w-48 shrink-0 lg:block">
        <p className="mb-2 text-[var(--text-xs)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">On this page</p>
        <ul className="flex flex-col gap-1">
          {TOC.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="block rounded-[var(--radius-sm)] px-2 py-1 text-[var(--text-sm)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="mb-4">
          <p className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Living specification</p>
          <h1 className="text-[var(--text-3xl)] font-semibold leading-[var(--leading-tight)] text-[var(--text-primary)]">Styleguide</h1>
          <p className="measure mt-2 text-[var(--text-base)] text-[var(--text-secondary)]">
            Every primitive, every state, both themes. Switch the app theme in the header (top right) to see this whole page
            re-render against the token system; the Color tokens section below additionally renders a fixed light panel and a
            fixed dark panel side-by-side regardless of the header toggle. Full prose contracts are in{" "}
            <code>docs/DESIGN-SYSTEM.md</code>.
          </p>
        </header>

        <Section id="tokens" title="Color tokens" intro="OKLCH-authored, APCA/WCAG-verified. See the live audit panel below.">
          <ColorTokens />
        </Section>

        <Section id="type-space-motion" title="Type / space / motion">
          <TypeSpaceMotion />
        </Section>

        <Section id="primitives" title="UI primitives" intro="Default / hover / focus-visible / disabled / loading / error, one implementation each.">
          <PrimitivesSection />
        </Section>

        <Section id="data" title="Data & insight components">
          <DataSection />
        </Section>

        <Section id="viewports" title="360 / 1440 composite" intro="Pixel-locked renders of the layout-sensitive composite (nav + metric grid).">
          <ViewportFrames />
        </Section>
      </div>
    </div>
  );
}
