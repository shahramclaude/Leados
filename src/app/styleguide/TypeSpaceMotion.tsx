const TYPE_STEPS = [
  { token: "--text-xs", px: "9.0px" },
  { token: "--text-sm", px: "12.8px" },
  { token: "--text-base", px: "14.0px (base)" },
  { token: "--text-md", px: "17.5px" },
  { token: "--text-lg", px: "21.9px" },
  { token: "--text-xl", px: "27.3px" },
  { token: "--text-2xl", px: "34.2px" },
  { token: "--text-3xl", px: "42.7px" },
];

const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

export function TypeSpaceMotion() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Type scale — 1.25 ratio, 14px base</h3>
        <div className="flex flex-col gap-2">
          {TYPE_STEPS.map((step) => (
            <div key={step.token} className="flex items-baseline gap-4">
              <span style={{ fontSize: `var(${step.token})` }} className="text-[var(--text-primary)]">
                Decisions compound
              </span>
              <span className="text-[var(--text-xs)] tabular-nums text-[var(--text-muted)]">
                {step.token} · {step.px}
              </span>
            </div>
          ))}
        </div>
        <p className="measure mt-3 text-[var(--text-sm)] text-[var(--text-secondary)]">
          Prose measure is clamped between 45 and 75 characters (<code>.measure</code> / <code>.measure-tight</code>) — this
          paragraph itself is constrained to that range so it stays comfortable to read regardless of viewport width, per
          the classic typographic readability guidance.
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Space — 4px grid</h3>
        <div className="flex flex-wrap items-end gap-3">
          {SPACE_STEPS.map((step) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className="bg-[var(--domain-strategy-solid)]" style={{ width: `var(--space-${step})`, height: `var(--space-${step})` }} />
              <span className="text-[var(--text-xs)] tabular-nums text-[var(--text-muted)]">{step * 4}px</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Radius</h3>
          <div className="flex gap-3">
            {["sm", "md", "lg", "xl", "full"].map((r) => (
              <div key={r} className="flex flex-col items-center gap-1">
                <div className="size-12 border border-[var(--border-default)] bg-[var(--surface-1)]" style={{ borderRadius: `var(--radius-${r})` }} />
                <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{r}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Elevation</h3>
          <div className="flex gap-4">
            {["1", "2", "3"].map((e) => (
              <div
                key={e}
                className="flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-2)] text-[var(--text-xs)] text-[var(--text-muted)]"
                style={{ boxShadow: `var(--elevation-${e})` }}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Motion</h3>
        <p className="measure text-[var(--text-sm)] text-[var(--text-secondary)]">
          <code>--motion-fast</code> 120ms, <code>--motion-base</code> 200ms, <code>--motion-slow</code> 320ms, easing{" "}
          <code>cubic-bezier(.2,.8,.2,1)</code>. All three durations collapse to 0ms under{" "}
          <code>prefers-reduced-motion: reduce</code> (see src/design/tokens.css, bottom block). Toggle your OS &ldquo;reduce
          motion&rdquo; setting and re-open a Dialog or Toast above to confirm there is no animation.
        </p>
      </div>
    </div>
  );
}
