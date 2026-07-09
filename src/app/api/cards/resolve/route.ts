import { NextRequest, NextResponse } from "next/server";
import { getCardsByNamesSafe } from "@/lib/scryfallServer";
import { ScryfallCard } from "@/types/mtg";

export async function POST(req: NextRequest) {
  const { names } = await req.json() as { names: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ cards: [] });
  }

  const resolved = await getCardsByNamesSafe(names);
  const cards = names
    .map((n) => resolved.get(n.toLowerCase()))
    .filter((c): c is ScryfallCard => !!c);

  return NextResponse.json({ cards });
}
