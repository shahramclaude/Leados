import { useMemo, useState } from "react";
import { useAppState } from "../lib/AppContext";
import { runInference } from "../lib/inference";
import { exportMarkdown, exportJSON, downloadTextFile } from "../lib/docs";
import { Card, SectionTitle, Button } from "../components/ui";

export function DocsView() {
  const { state } = useAppState();
  const findings = useMemo(() => runInference(state.signalBoard), [state.signalBoard]);
  const [format, setFormat] = useState<"md" | "json">("md");
  const content = format === "md" ? exportMarkdown(state, findings) : exportJSON(state, findings);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Docs"
        subtitle="js/docs.js — generates a Markdown or JSON export of this session's state. No network calls; everything happens client-side."
      />
      <Card>
        <div className="flex items-center gap-3">
          <Button variant={format === "md" ? "primary" : "ghost"} onClick={() => setFormat("md")}>
            Markdown
          </Button>
          <Button variant={format === "json" ? "primary" : "ghost"} onClick={() => setFormat("json")}>
            JSON
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadTextFile(`leados-export.${format === "md" ? "md" : "json"}`, content, format === "md" ? "text/markdown" : "application/json")}
          >
            Download
          </Button>
        </div>
      </Card>
      <Card>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{content}</pre>
      </Card>
    </div>
  );
}
