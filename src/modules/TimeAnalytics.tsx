import { Card, SectionHeader, Badge } from "../components/ui";
import { timeBlocks } from "../data/mockData";

export function TimeAnalytics() {
  const total = timeBlocks.reduce((a, b) => a + b.hours, 0);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Time Analytics"
        subtitle="Self-owned by design: this view is scoped to you only."
        action={<Badge tone="slate">🔒 Visible to: only me</Badge>}
      />

      <Card>
        <div className="flex h-6 w-full overflow-hidden rounded-full">
          {timeBlocks.map((b) => (
            <div key={b.category} className={b.color} style={{ width: `${(b.hours / total) * 100}%` }} title={b.category} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {timeBlocks.map((b) => (
            <div key={b.category} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${b.color}`} />
              <span className="text-slate-600">{b.category}</span>
              <span className="ml-auto font-medium text-slate-800">{b.hours}h</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="text-sm text-slate-600">
        This data is never pushed to board packets, performance reviews, or peer comparisons by default. Sharing it
        is an explicit, revocable opt-in action the leader takes — never a default export.
      </Card>
    </div>
  );
}
