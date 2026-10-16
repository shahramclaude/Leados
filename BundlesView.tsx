import { useState } from "react";
import { TEMPLATES, type EventSpec } from "../automation/templates";
import type { Store } from "../automation/types";
import { Button, Card, Pill, SectionTitle } from "../components/shared";
import { BundleModal } from "../components/BundleModal";

export function BundlesView({ store, onLogBundle }: { store: Store; onLogBundle: (specs: EventSpec[], source: string, summary: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const template = TEMPLATES.find((t) => t.id === openId);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Each bundle is one command/form → several events, submitted together. One submit, every event still append-only and individually auditable.">
          Event Templates
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col justify-between rounded-xl border border-slate-200 p-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{t.label}</h3>
                  {t.shortcut && <Pill tone="violet">key: {t.shortcut}</Pill>}
                </div>
                <p className="mb-2 font-mono text-xs text-slate-400">{t.command}</p>
                <p className="text-sm text-slate-600">{t.description}</p>
              </div>
              <div className="mt-4">
                <Button onClick={() => setOpenId(t.id)}>Run bundle</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {template && (
        <BundleModal
          template={template}
          people={store.people}
          onClose={() => setOpenId(null)}
          onSubmit={(values) => {
            const specs = template.build(values);
            onLogBundle(specs, `Bundles → ${template.label}`, specs[specs.length - 1]?.type ?? "");
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
