import { createOrganization } from "@/lib/app/useCases/organizations/createOrganization";
import { listOrganizations } from "@/lib/app/useCases/organizations/listOrganizations";

export const dynamic = "force-dynamic";

export async function GET() {
  const organizations = await listOrganizations();
  return Response.json({ organizations });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    const organization = await createOrganization({ name: body.name ?? "" });
    return Response.json({ organization }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
