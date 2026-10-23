import { Card, SectionHeader, Badge, ProgressBar } from "../components/ui";

const state = [
  { label: "Energy", value: 54 },
  { label: "Focus capacity", value: 38 },
  { label: "Decision load today", value: 81 },
];

export function LeaderState() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Leader State"
        subtitle="Self-scoped: this exists for your own awareness only."
        action={<Badge tone="slate">🔒 Not shared with HR, board, or peers</Badge>}
      />
      <Card>
        <div className="space-y-4">
          {state.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex justify-between text-sm"><span>{s.label}</span><span>{s.value}/100</span></div>
              <ProgressBar value={s.value} tone={s.value < 40 ? "rose" : s.value < 70 ? "amber" : "emerald"} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="text-sm text-slate-600">
        Decision load is high and focus capacity is low today. The system's only action here is to suggest you
        protect the next open calendar block — it cannot and does not reschedule anything on your behalf.
      </Card>
    </div>
  );
}
