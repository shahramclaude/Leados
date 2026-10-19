/** Circular arc, 0-100, used to visualize the composite entropy score. */
export function EntropyArc({ score, color, size = 120 }: { score: number; color: string; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circumference * pct;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Entropy arc, ${score} of 100`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={size * 0.18} fontWeight={700} fill="var(--text)">
        {Math.round(score)}
      </text>
      <text x={cx} y={cy + size * 0.18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={size * 0.07} fill="var(--text-muted)">
        / 100
      </text>
    </svg>
  );
}
