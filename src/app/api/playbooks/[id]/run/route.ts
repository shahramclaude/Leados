import { NextResponse } from "next/server";
import { invokeCapability } from "@/lib/kernel/capabilities";
import "@/lib/playbooksEngine"; // ensures the "playbook.invoke" capability is registered

export const dynamic = "force-dynamic";

// POST { invokedBy, invokedVia?: "human"|"automation", context? }
// Goes through the `playbook.invoke` kernel capability so human and kernel
// invocations are indistinguishable to the effectiveness-measurement code
// (mission §D).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { invokedBy?: string; invokedVia?: "human" | "automation"; context?: Record<string, unknown> };
  const invokedVia = body.invokedVia ?? "human";
  try {
    const result = await invokeCapability(
      "playbook.invoke",
      { playbookId: Number(id), invokedBy: body.invokedBy ?? "unknown", invokedVia, context: body.context },
      { kind: invokedVia === "automation" ? "kernel" : "human", name: body.invokedBy ?? "unknown" }
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
