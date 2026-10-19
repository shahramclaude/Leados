"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/leados/ui/Overlays";
import { Button } from "@/components/leados/ui/Primitives";
import { FormField, Input, Select, Textarea } from "@/components/leados/ui/Forms";
import { useToast } from "@/components/leados/ui/Toast";

export function NewDecisionButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { push } = useToast();
  const [open, setOpen] = useState(searchParams.get("new") === "1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    router.replace(pathname);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      title: form.get("title"),
      owner: form.get("owner"),
      severity: form.get("severity"),
      dueDate: form.get("dueDate"),
      description: form.get("description"),
    };
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not create the decision.");
      }
      push({ title: "Decision created", description: "Added to the pending queue.", tone: "good" });
      router.refresh();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          router.replace(`${pathname}?new=1`);
        }}
      >
        New decision
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="New decision"
        description="This goes straight into the pending queue for today."
        footer={
          <>
            <Button variant="secondary" onClick={close} type="button">
              Cancel
            </Button>
            <Button type="submit" form="new-decision-form" loading={submitting}>
              Create decision
            </Button>
          </>
        }
      >
        <form id="new-decision-form" className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FormField id="decision-title" label="Title" required error={error ?? undefined}>
            <Input id="decision-title" name="title" required placeholder="e.g. Approve renewal discount ceiling" />
          </FormField>
          <FormField id="decision-owner" label="Owner" required>
            <Input id="decision-owner" name="owner" required placeholder="Who needs to make this call?" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="decision-severity" label="Severity">
              <Select id="decision-severity" name="severity" defaultValue="warning">
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="caution">Caution</option>
                <option value="info">Informational</option>
              </Select>
            </FormField>
            <FormField id="decision-due" label="Due date">
              <Input id="decision-due" name="dueDate" type="date" />
            </FormField>
          </div>
          <FormField id="decision-description" label="Context" description="What happens if this doesn't get decided?">
            <Textarea id="decision-description" name="description" rows={3} />
          </FormField>
        </form>
      </Modal>
      {open ? (
        <div className="sr-only" aria-live="polite">
          {submitting ? "Saving decision…" : null}
        </div>
      ) : null}
    </>
  );
}
