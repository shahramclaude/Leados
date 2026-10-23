import { submitSuggestion, listSuggestions } from "@/lib/dissent";

export const dynamic = "force-dynamic";

// GET is deliberately unfiltered by role — dissent visibility cannot be
// narrowed per audience, which is the structural anti-suppression guarantee.
export async function GET() {
  const suggestions = await listSuggestions();
  return Response.json({ suggestions });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.body) return Response.json({ error: '"body" is required' }, { status: 400 });
  const result = await submitSuggestion({ body: body.body, category: body.category });
  return Response.json(
    {
      id: result.id,
      claimToken: result.claimToken,
      note: "Save this claim token if you want to prove authorship later — it is shown only once and no identity was recorded.",
    },
    { status: 201 },
  );
}
