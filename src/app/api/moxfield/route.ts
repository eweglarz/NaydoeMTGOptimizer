import { NextRequest, NextResponse } from "next/server";
import { fetchMoxfieldDeck, parseTextDeckList, extractMoxfieldId } from "@/lib/moxfield";
import { getCardsByNamesSafe as getCardsByNames } from "@/lib/scryfallServer";
import { ScryfallCard } from "@/types/mtg";

// POST body: { url?: string; text?: string }
export async function POST(req: NextRequest) {
  const body = await req.json() as { url?: string; text?: string };

  let commanderNames: string[] = [];
  let cardNames: string[] = [];
  let sideboardNames: string[] = [];

  if (body.url) {
    const id = extractMoxfieldId(body.url);
    if (!id) return NextResponse.json({ error: "Invalid Moxfield URL" }, { status: 400 });
    try {
      const parsed = await fetchMoxfieldDeck(id);
      commanderNames = parsed.commanderNames;
      cardNames = parsed.cardNames;
    } catch (err) {
      const msg = String(err);
      const friendlyMsg = msg.includes("403")
        ? "Moxfield requires authentication to access decks via API. Export your deck from Moxfield (Export → Text) and use 'Paste List' instead."
        : msg;
      return NextResponse.json({ error: friendlyMsg }, { status: 502 });
    }
  } else if (body.text) {
    const parsed = parseTextDeckList(body.text);
    commanderNames = parsed.commanderNames;
    cardNames = parsed.cardNames;
    sideboardNames = parsed.sideboardNames ?? [];
  } else {
    return NextResponse.json({ error: "url or text required" }, { status: 400 });
  }

  // Resolve all unique names in bulk via Scryfall /cards/collection (75 per request)
  const allUniqueNames = [...new Set([...commanderNames, ...cardNames, ...sideboardNames])];
  const resolved = await getCardsByNames(allUniqueNames);

  const commanders = commanderNames
    .map((n) => resolved.get(n.toLowerCase()))
    .filter((c): c is ScryfallCard => !!c);

  // Expand cardNames back out so duplicates (e.g. 10 Mountains) are preserved
  const cards = cardNames
    .map((n) => resolved.get(n.toLowerCase()))
    .filter((c): c is ScryfallCard => !!c);

  const sideboard = sideboardNames
    .map((n) => resolved.get(n.toLowerCase()))
    .filter((c): c is ScryfallCard => !!c);

  return NextResponse.json({ commanders, cards, sideboard });
}
