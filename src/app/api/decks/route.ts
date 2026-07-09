import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDecksByUser, createDeck } from "@/lib/appDb";

function parseDeck(d: ReturnType<typeof getDecksByUser>[number]) {
  return {
    id: d.id,
    name: d.name,
    commanderName: d.commander_name,
    partnerName: d.partner_name,
    cardNames: JSON.parse(d.card_names) as string[],
    sideboardNames: JSON.parse(d.sideboard_names) as string[],
    lookingToAdd: JSON.parse(d.looking_to_add) as string[],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ decks: getDecksByUser(session.sub).map(parseDeck) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name: string;
    commanderName?: string | null;
    partnerName?: string | null;
    cardNames?: string[];
    sideboardNames?: string[];
    lookingToAdd?: string[];
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Deck name is required." }, { status: 400 });
  }

  const deck = createDeck({
    id: crypto.randomUUID(),
    user_id: session.sub,
    name: body.name.trim(),
    commander_name: body.commanderName ?? null,
    partner_name: body.partnerName ?? null,
    card_names: JSON.stringify(body.cardNames ?? []),
    sideboard_names: JSON.stringify(body.sideboardNames ?? []),
    looking_to_add: JSON.stringify(body.lookingToAdd ?? []),
  });

  return NextResponse.json({ deck: parseDeck(deck) }, { status: 201 });
}
