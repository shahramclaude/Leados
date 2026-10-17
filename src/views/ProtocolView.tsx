import { useState } from "react";
import { CATEGORIES } from "../lib/rules";
import type { Category, Severity } from "../lib/types";
import { getProtocol } from "../lib/protocol";
import { Card, SectionTitle } from "../components/ui";

export function ProtocolView() {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [severity, setSeverity] = useState<Severity>("medium");
  const steps = getProtocol(category, severity);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Protocols"
        subtitle="js/protocol.js — response playbooks by category and severity. Original generic management practice, not sourced from a named external framework."
      />
      <Card>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
      </Card>
      <Card>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {steps.map((step) => (
            <li key={step.order}>
              <span className="font-medium">{step.owner}:</span> {step.action}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
