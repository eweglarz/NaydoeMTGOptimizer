import { NextRequest, NextResponse } from "next/server";
import { searchCards } from "@/lib/scryfall";
import { ScryfallCard } from "@/types/mtg";

// Maps CardTag kinds to Scryfall oracle-text queries that find functionally similar cards.
const TAG_QUERIES: Record<string, string> = {
  draw: 'o:"draw"',
  removal: '(o:"destroy target" OR o:"exile target" OR o:"destroy all" OR o:"exile all")',
  tutor: 'o:"search your library for"',
  control: '(o:"counter target spell" OR o:"can\'t cast" OR o:"unless" o:"pays")',
  counters: '(o:"+1/+1 counter" OR o:"-1/-1 counter" OR o:"put" o:"counter onto")',
  copy: '(o:"copy target" OR o:"create a copy" OR o:"copies of")',
  utility: 'o:"add {"',
};

function getTypeFilter(typeLine: string): string {
  const t = typeLine.toLowerCase();
  if (t.includes("creature")) return "t:creature";
  if (t.includes("instant")) return "t:instant";
  if (t.includes("sorcery")) return "t:sorcery";
  if (t.includes("enchantment")) return "t:enchantment";
  if (t.includes("artifact")) return "t:artifact";
  if (t.includes("planeswalker")) return "t:planeswalker";
  if (t.includes("land")) return "t:land";
  return "-t:land";
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    cardName: string;
    tags: string[];
    colorIdentity: string[];
    cmc: number;
    typeLine: string;
    deckCardNames: string[];
  };

  const ciStr = body.colorIdentity.length > 0
    ? body.colorIdentity.map((c) => c.toLowerCase()).join("")
    : "c";

  const typeFilter = getTypeFilter(body.typeLine ?? "");
  const deckSet = new Set(body.deckCardNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const allResults: ScryfallCard[] = [];

  for (const tag of body.tags) {
    const qBase = TAG_QUERIES[tag];
    if (!qBase) continue;

    const query = `${qBase} ${typeFilter} legal:commander id<=${ciStr}`;

    try {
      const res = await searchCards(query);
      for (const card of res.data) {
        if (
          !seen.has(card.id) &&
          card.name.toLowerCase() !== body.cardName.toLowerCase() &&
          !deckSet.has(card.name.toLowerCase())
        ) {
          seen.add(card.id);
          allResults.push(card);
        }
      }
    } catch {
      // Scryfall returned no results or errored for this tag — skip
    }
  }

  const cheaper = allResults.filter((c) => c.cmc < body.cmc);
  const rest = allResults.filter((c) => c.cmc >= body.cmc);

  return NextResponse.json({
    suggestions: [...cheaper, ...rest].slice(0, 15),
    sourceCmc: body.cmc,
  });
}
