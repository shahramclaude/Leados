"use client";

import { useAppContext } from "@/lib/AppContext";
import { Card, EmptyPanel, ErrorPanel, LoadingPanel, SevBadge, ViewHeader } from "@/components/ui";

export default function ExecutionView() {
  const { result, error } = useAppContext();

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const blockers = result.blockers.filter((b) => b.status === "open");
  const projectNames = new Map(result.projects.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <ViewHeader title="Execution" subtitle="Projects, delivery confidence, critical path, and open blockers." />

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Critical path</p>
        {result.criticalPath.length === 0 ? (
          <EmptyPanel message="No critical path computed (no projects, or dependency cycle detected)." />
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {result.criticalPath.map((id, idx) => (
              <span key={id} className="flex items-center gap-2">
                <span className="rounded border border-indigo-700 bg-indigo-500/10 px-2 py-1 font-mono text-indigo-300">
                  {projectNames.get(id) ?? id}
                </span>
                {idx < result.criticalPath.length - 1 && <span className="text-slate-600">{"\u2192"}</span>}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Projects</p>
        {result.projects.length === 0 && <EmptyPanel message="No projects recorded." />}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Project</th>
              <th className="py-2">Delivery confidence</th>
              <th className="py-2">Overdue milestones</th>
              <th className="py-2">Critical blockers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {result.projects.map((p) => (
              <tr key={p.id}>
                <td className="py-2 text-slate-200">{p.name}</td>
                <td className="py-2 font-mono text-slate-300">{p.deliveryConfidence}%</td>
                <td className="py-2 text-slate-400">{p.overdueMilestones}</td>
                <td className="py-2 text-slate-400">{p.criticalBlockers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Open blockers</p>
        {blockers.length === 0 && <EmptyPanel message="No open blockers." />}
        <ul className="divide-y divide-slate-800">
          {blockers.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2">
              <div>
                <span className="block text-sm text-slate-200">{b.title}</span>
                {b.projectId && <span className="block text-xs text-slate-500">{projectNames.get(b.projectId) ?? b.projectId}</span>}
              </div>
              <SevBadge sev={b.sev} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
