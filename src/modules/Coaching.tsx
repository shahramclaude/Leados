import { Card, SectionHeader, ProgressBar, Badge } from "../components/ui";

const skills = [
  { name: "Delegation", value: 72 },
  { name: "Strategic framing", value: 58 },
  { name: "Difficult feedback", value: 41 },
  { name: "Listening under pressure", value: 66 },
];

export function Coaching() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Coaching" subtitle="Your growth data. This is structurally separate from performance evaluation." />
      <Card className="flex items-center justify-between bg-emerald-50">
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <span>🔒</span>
          <span>Wall active: coaching reflections are never readable by the evaluation module, your manager's view, or the board packet generator.</span>
        </div>
        <Badge tone="emerald">Data wall enforced</Badge>
      </Card>

      <Card>
        <SectionHeader title="Skill growth (self-reported + 360 synthesis)" />
        <div className="space-y-4">
          {skills.map((s) => (
            <div key={s.name}>
              <div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span>{s.value}/100</span></div>
              <ProgressBar value={s.value} max={100} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="This week's prompt" />
        <p className="text-sm text-slate-600">
          "You gave critical feedback to two reports this week but delayed a third conversation twice. What's different about that one?"
        </p>
        <textarea className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm" rows={3} placeholder="Private reflection — not shared, not scored." />
      </Card>
    </div>
  );
}
