import { NextRequest, NextResponse } from "next/server";
import { getCommanderRecommendations } from "@/lib/edhrec";
import { getCardByName } from "@/lib/scryfall";
import { generateSuggestions, scoreDeck } from "@/lib/optimizer";
import { ScryfallCard } from "@/types/mtg";

type FilterTier = "all" | "budget" | "mid" | "expensive";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    commanderName: string;
    deckCardNames: string[];
    budgetFilter?: FilterTier;
  };

  const { commanderName, deckCardNames, budgetFilter = "all" } = body;
  if (!commanderName) return NextResponse.json({ error: "commanderName required" }, { status: 400 });

  // Parallel: fetch EDHREC + resolve deck cards via Scryfall
  const [recommendations, deckCardsResolved] = await Promise.all([
    getCommanderRecommendations(commanderName),
    Promise.all(deckCardNames.map((n) => getCardByName(n))).then(
      (results) => results.filter((c): c is ScryfallCard => !!c)
    ),
  ]);

  // Resolve EDHREC recommendation card names (top 60 by synergy)
  const topEdhrecNames = recommendations.cards
    .sort((a, b) => (b.synergy_score ?? 0) - (a.synergy_score ?? 0))
    .slice(0, 60)
    .map((c) => c.name);

  const resolvedEdhrecCards = (
    await Promise.all(topEdhrecNames.map((n) => getCardByName(n)))
  ).filter((c): c is ScryfallCard => !!c);

  const commander = await getCardByName(commanderName);
  if (!commander) return NextResponse.json({ error: "Commander not found" }, { status: 404 });

  const suggestions = generateSuggestions({
    deckCards: deckCardsResolved,
    commander,
    recommendations,
    resolvedEdhrecCards,
    budgetFilter,
  });

  const deckScore = scoreDeck(deckCardsResolved, recommendations);

  return NextResponse.json({ suggestions, deckScore, recommendations });
}
