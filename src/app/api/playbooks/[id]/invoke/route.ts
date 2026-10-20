import { NextResponse } from "next/server";
import { invokePlaybook } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

/**
 * Invocation endpoint used by BOTH the automation kernel (`invokedVia:
 * "automation"`) and the human UI (`invokedVia: "human"`, the default) —
 * this is what makes a playbook "invocable end-to-end".
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playbookId = Number(id);
  const body = (await request.json().catch(() => ({}))) as {
    invokedBy?: string;
    invokedVia?: "human" | "automation";
    context?: Record<string, unknown>;
  };
  try {
    const result = await invokePlaybook({
      playbookId,
      invokedBy: body.invokedBy ?? "anonymous",
      invokedVia: body.invokedVia ?? "human",
      context: body.context ?? {},
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
