import { getMaintenanceState } from "@/lib/maintenance";
import { getSetting, INCIDENT_KEY, DEFAULT_INCIDENT } from "@/lib/settings";
import type { IncidentState } from "@/lib/settings";

const SEVERITY_STYLES: Record<IncidentState["severity"], string> = {
  minor: "bg-amber-100 text-amber-900 border-amber-300",
  major: "bg-orange-100 text-orange-900 border-orange-300",
  critical: "bg-red-100 text-red-900 border-red-300",
};

export default async function Banners() {
  const [maintenance, incident] = await Promise.all([
    getMaintenanceState(),
    getSetting<IncidentState>(INCIDENT_KEY, DEFAULT_INCIDENT),
  ]);

  if (!maintenance.enabled && !incident.active) return null;

  return (
    <div className="flex flex-col">
      {maintenance.enabled && (
        <div className="w-full border-b border-slate-300 bg-slate-800 px-4 py-2 text-center text-sm font-medium text-white">
          🔧 Maintenance mode is ON — the system is read-only. Writes are being queued and will be
          applied automatically once maintenance ends.
          {maintenance.reason ? ` Reason: ${maintenance.reason}` : ""}
        </div>
      )}
      {incident.active && (
        <div className={`w-full border-b px-4 py-2 text-center text-sm font-medium ${SEVERITY_STYLES[incident.severity]}`}>
          🚨 Incident ({incident.severity}): {incident.message || "investigating"}
          {incident.runbookUrl ? (
            <>
              {" — "}
              <a className="underline" href={incident.runbookUrl}>
                runbook
              </a>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
