import type { Projection } from '../lib/types';
import { analyzeMeetings } from '../lib/extras';
import { Card, SectionTitle, Callout } from './ui';

export function MeetingView({ P }: { P: Projection }) {
  const { meetings, avgVelocity, label } = analyzeMeetings(P);
  return (
    <div className="space-y-6">
      <SectionTitle title="Meeting Intelligence" subtitle={label} />
      <Card>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Average decision velocity</div>
        <div className="mt-1 text-3xl font-bold text-slate-900">{avgVelocity} <span className="text-base font-normal text-slate-400">decisions/hour</span></div>
      </Card>
      <div className="space-y-2">
        {meetings.map((m) => (
          <Card key={m.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold capitalize text-slate-800">{m.type} meeting</div>
                <div className="text-xs text-slate-400">{new Date(m.ts).toLocaleDateString()} \u00b7 {m.attendeeCount} attendees \u00b7 {m.durationMinutes}min</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-800">{m.decisionsCount} decisions</div>
                <div className="text-xs text-slate-400">{m.decisionVelocityPerHour}/hr</div>
              </div>
            </div>
            {m.flag && <Callout tone="rose">{m.flag}</Callout>}
          </Card>
        ))}
      </div>
    </div>
  );
}
