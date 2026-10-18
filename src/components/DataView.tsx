import { useRef, useState } from "react";
import { buildSeed, STORAGE_KEY, wipe } from "../lib/store";
import type { AppState } from "../lib/types";
import { Button, Card } from "./Shell";

export function DataView({ state, onReplace }: { state: AppState; onReplace: (s: AppState) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leados-sandbox-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.people)) throw new Error("missing people[]");
        onReplace(parsed as AppState);
        setMessage("Import successful.");
      } catch (err) {
        setMessage(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
        <p className="text-sm text-stone-500">
          Everything lives in <code>localStorage</code> under <code className="font-mono">{STORAGE_KEY}</code>. No network calls, no accounts.
        </p>
      </div>

      <Card title="Export / import">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={exportJson}>Export JSON</Button>
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJson} />
        </div>
        {message && <div className="mt-3 text-sm text-stone-600">{message}</div>}
      </Card>

      <Card title="Reset">
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => onReplace(buildSeed())}>Reset to seed data</Button>
          <Button
            variant="danger"
            onClick={() => {
              wipe();
              onReplace(buildSeed());
            }}
          >
            Wipe localStorage + reseed
          </Button>
        </div>
      </Card>

      <Card title="Raw state (read-only)">
        <pre className="max-h-96 overflow-auto rounded-lg bg-stone-900 p-3 text-xs text-stone-100">{JSON.stringify(state, null, 2)}</pre>
      </Card>
    </div>
  );
}
