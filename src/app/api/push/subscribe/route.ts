import { requireSession } from "@/lib/platform/session";
import { errorToResponse } from "@/lib/platform/authz";
import { subscribeToPush, type PushSubscribeInput } from "@/lib/app/push";
import { pushPublicKey } from "@/lib/platform/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ publicKey: pushPublicKey() });
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as PushSubscribeInput;
    const row = await subscribeToPush(session, body);
    return Response.json({ subscription: row }, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
