import { NextRequest, NextResponse } from "next/server";
import { searchCards, searchCommanders, autocompleteCards } from "@/lib/scryfall";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const mode = searchParams.get("mode") ?? "cards";

  if (!q) return NextResponse.json({ data: [], has_more: false, total_cards: 0 });

  try {
    if (mode === "commander") {
      const data = await searchCommanders(q);
      return NextResponse.json({ data });
    }
    if (mode === "autocomplete") {
      const data = await autocompleteCards(q);
      return NextResponse.json({ data });
    }
    const data = await searchCards(q, parseInt(searchParams.get("page") ?? "1"));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
