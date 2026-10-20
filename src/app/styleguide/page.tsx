// Static design-system showcase used only as a visual regression target
// (see tests/e2e/visual.spec.ts + docs/TESTING.md). No data fetching, no
// client state beyond the shared theme toggle, so snapshots are stable.

const PALETTE = [
  { name: "Background", varName: "--bg" },
  { name: "Surface", varName: "--surface" },
  { name: "Foreground", varName: "--fg" },
  { name: "Muted", varName: "--muted" },
  { name: "Border", varName: "--border" },
  { name: "Accent", varName: "--accent" },
];

export default function StyleguidePage() {
  return (
    <div className="space-y-10" data-testid="styleguide">
      <section>
        <h1 className="text-2xl font-semibold">Styleguide</h1>
        <p style={{ color: "var(--muted)" }}>Design tokens and primitives, light + dark.</p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {PALETTE.map((swatch) => (
          <div key={swatch.varName} className="space-y-2">
            <div
              className="h-16 rounded-xl border"
              style={{ backgroundColor: `var(${swatch.varName})`, borderColor: "var(--border)" }}
            />
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {swatch.name}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Typography</h2>
        <p className="text-3xl font-semibold">Heading / 3xl</p>
        <p className="text-xl font-medium">Heading / xl</p>
        <p className="text-base">Body text at the base size, used for paragraphs across LEADOS.</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Muted / small text for captions and metadata.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-lg px-4 py-2 font-medium text-white" style={{ backgroundColor: "var(--accent)" }}>
            Primary
          </button>
          <button className="rounded-lg border px-4 py-2 font-medium" style={{ borderColor: "var(--border)" }}>
            Secondary
          </button>
          <button className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: "var(--border)" }}>
            Pill
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cards</h2>
        <div className="ld-surface max-w-sm rounded-2xl border p-6">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Label
          </p>
          <p className="mt-2 text-2xl font-semibold">42</p>
        </div>
      </section>
    </div>
  );
}
