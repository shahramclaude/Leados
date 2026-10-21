// ---------------------------------------------------------------------------
// Inline-on-blur validators: return not just an error, but a suggested fix.
// ---------------------------------------------------------------------------

export interface FieldValidation {
  valid: boolean;
  message?: string;
  suggestion?: string;
}

export function validateTitle(value: string, minLength = 3): FieldValidation {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: "Title is required.", suggestion: "Give it a short, specific name." };
  }
  if (trimmed.length < minLength) {
    return {
      valid: false,
      message: `Title must be at least ${minLength} characters.`,
      suggestion: `Try something like "${trimmed} — Q3 rollout".`,
    };
  }
  if (trimmed !== value) {
    return { valid: true, message: undefined, suggestion: "Leading/trailing spaces will be trimmed." };
  }
  return { valid: true };
}

export function validateBody(value: string, minLength = 5): FieldValidation {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: "This field is required.", suggestion: "Add a sentence describing it." };
  }
  if (trimmed.length < minLength) {
    return {
      valid: false,
      message: `Add a bit more detail (at least ${minLength} characters).`,
      suggestion: "What did you observe, and why does it matter?",
    };
  }
  return { valid: true };
}

export function validateSelect(value: string, label: string): FieldValidation {
  if (!value) {
    return { valid: false, message: `${label} is required.`, suggestion: `Pick one from the list.` };
  }
  return { valid: true };
}
