import { NextRequest, NextResponse } from "next/server";
import { searchCards } from "@/lib/scryfall";
import { ScryfallCard } from "@/types/mtg";

// Maps CardTag kinds to Scryfall oracle-text queries that find functionally similar cards.
const TAG_QUERIES: Record<string, string> = {
  draw: 'o:"draw" -t:land',
  removal: '(o:"destroy target" OR o:"exile target" OR o:"destroy all" OR o:"exile all") -t:land',
  tutor: 'o:"search your library for" -t:land',
  control: '(o:"counter target spell" OR o:"can\'t cast" OR o:"unless" o:"pays") -t:land',
  counters: '(o:"+1/+1 counter" OR o:"-1/-1 counter" OR o:"put" o:"counter onto") -t:land',
  copy: '(o:"copy target" OR o:"create a copy" OR o:"copies of") -t:land',
  utility: 'o:"add {" -t:land',
};

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    cardName: string;
    tags: string[];
    colorIdentity: string[];
    cmc: number;
    deckCardNames: string[];
  };

  // Scryfall color identity filter: id<=wub means card CI ⊆ {W,U,B}
  const ciStr = body.colorIdentity.length > 0
    ? body.colorIdentity.map((c) => c.toLowerCase()).join("")
    : "c";

  const deckSet = new Set(body.deckCardNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const allResults: ScryfallCard[] = [];

  for (const tag of body.tags) {
    const qBase = TAG_QUERIES[tag];
    if (!qBase) continue;

    // legal:commander enforces format legality; id<= enforces color identity
    const query = `${qBase} legal:commander id<=${ciStr}`;

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

  // Deduplicate and surface cheaper alternatives first, then rest sorted by EDHREC rank
  // (searchCards already uses order=edhrec so allResults is roughly EDHREC-ordered)
  const cheaper = allResults.filter((c) => c.cmc < body.cmc);
  const rest = allResults.filter((c) => c.cmc >= body.cmc);

  return NextResponse.json({
    suggestions: [...cheaper, ...rest].slice(0, 15),
    sourceCmc: body.cmc,
  });
}
