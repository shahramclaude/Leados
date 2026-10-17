import { useState } from "react";
import { CATEGORIES } from "../lib/rules";
import type { Category } from "../lib/types";
import { TREES, traverse } from "../lib/decisionTrees";
import { Card, SectionTitle, Button } from "../components/ui";

export function DecisionTreesView() {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const tree = TREES[category];
  let node = tree.start;
  for (const a of answers) {
    const nextId = a ? node.yes : node.no;
    if (!nextId || !tree[nextId]) break;
    node = tree[nextId];
  }
  const result = node.result ? traverse(category, answers) : null;

  const answer = (value: boolean) => setAnswers((prev) => [...prev, value]);
  const restart = () => setAnswers([]);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Decision Trees"
        subtitle="js/decision_trees.js — walk a finding to a concrete recommendation. Original trees, one per category."
      />
      <Card>
        <label className="text-sm">
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              restart();
            }}
            className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </Card>
      <Card>
        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800">{result}</div>
            <Button variant="ghost" onClick={restart}>
              Start over
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-lg font-medium text-slate-800">{node.question}</p>
            <div className="flex gap-3">
              <Button onClick={() => answer(true)}>Yes</Button>
              <Button variant="ghost" onClick={() => answer(false)}>
                No
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
