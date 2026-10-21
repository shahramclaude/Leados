import type { FieldValidation } from "./validation";

export function FieldFeedback({ validation, touched }: { validation: FieldValidation; touched: boolean }) {
  if (!touched) return null;
  if (validation.valid && !validation.suggestion) return null;
  return (
    <p className={`mt-1 text-xs ${validation.valid ? "text-slate-500" : "text-rose-600"}`}>
      {validation.message}
      {validation.suggestion && <span className="block text-slate-500">Suggestion: {validation.suggestion}</span>}
    </p>
  );
}
