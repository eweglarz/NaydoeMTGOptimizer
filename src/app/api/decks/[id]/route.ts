import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { upsertDeck, deleteDeck } from "@/lib/appDb";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    name: string;
    commanderName?: string | null;
    partnerName?: string | null;
    cardNames?: string[];
    sideboardNames?: string[];
    lookingToAdd?: string[];
  };

  upsertDeck(id, session.sub, {
    name: body.name?.trim() || "Untitled Deck",
    commander_name: body.commanderName ?? null,
    partner_name: body.partnerName ?? null,
    card_names: JSON.stringify(body.cardNames ?? []),
    sideboard_names: JSON.stringify(body.sideboardNames ?? []),
    looking_to_add: JSON.stringify(body.lookingToAdd ?? []),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = deleteDeck(id, session.sub);
  if (!deleted) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
