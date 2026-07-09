import { NextRequest, NextResponse } from "next/server";
import { getCommanderRecommendations } from "@/lib/edhrec";
import { getCardByNameSafe as getCardByName } from "@/lib/scryfallServer";
import { getCardTags, searchCards } from "@/lib/scryfall";
import { generateSuggestions, scoreDeck } from "@/lib/optimizer";
import { getScryfallSuggestions } from "@/lib/scryfallSynergy";
import { ScryfallCard } from "@/types/mtg";

// Maps functional tag kinds to Scryfall oracle queries for CMC-upgrade search
const TAG_UPGRADE_QUERIES: Record<string, string> = {
  draw: 'o:"draw" -t:land',
  removal: '(o:"destroy target" OR o:"exile target" OR o:"destroy all" OR o:"exile all") -t:land',
  tutor: 'o:"search your library for" -t:land',
  control: 'o:"counter target spell" -t:land',
  copy: '(o:"create a copy" OR o:"copy target") -t:land',
  utility: 'o:"add {" -t:land',
};

type FilterTier = "all" | "budget" | "mid" | "expensive";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    commanderName: string;
    deckCardNames: string[];
    budgetFilter?: FilterTier;
  };

  const { commanderName, deckCardNames, budgetFilter = "all" } = body;
  if (!commanderName) return NextResponse.json({ error: "commanderName required" }, { status: 400 });

  // Parallel: EDHREC data + deck card resolution + commander card
  const [recommendations, deckCardsResolved, commander] = await Promise.all([
    getCommanderRecommendations(commanderName),
    Promise.all(deckCardNames.map((n) => getCardByName(n))).then(
      (results) => results.filter((c): c is ScryfallCard => !!c)
    ),
    getCardByName(commanderName),
  ]);

  if (!commander) return NextResponse.json({ error: "Commander not found" }, { status: 404 });

  const topEdhrecNames = recommendations.cards
    .sort((a, b) => (b.synergy_score ?? 0) - (a.synergy_score ?? 0))
    .slice(0, 60)
    .map((c) => c.name);

  // Build lookup sets for deduplication in Scryfall search
  const deckNames = new Set(deckCardsResolved.map((c) => c.name.toLowerCase()));
  const edhrecNames = new Set(recommendations.cards.map((c) => c.name.toLowerCase()));

  // Color identity for Scryfall id<= filter
  const ciStr = commander.color_identity.length > 0
    ? commander.color_identity.map((c) => c.toLowerCase()).join("")
    : "c";

  // For each functional tag type, find the highest-CMC deck card with that tag.
  // We'll suggest a lower-CMC alternative from Scryfall (ordered by EDHREC popularity).
  const worstByTag = new Map<string, ScryfallCard>();
  for (const card of deckCardsResolved) {
    for (const tag of getCardTags(card)) {
      if (!TAG_UPGRADE_QUERIES[tag.kind]) continue;
      const current = worstByTag.get(tag.kind);
      if (!current || card.cmc > current.cmc) worstByTag.set(tag.kind, card);
    }
  }

  // Only search for upgrades when the worst card's CMC is meaningfully high (> 2)
  const upgradeEntries = [...worstByTag.entries()].filter(([, src]) => src.cmc > 2);

  // Parallel: resolve top EDHREC card names + theme-based Scryfall searches + CMC upgrade searches
  const [resolvedEdhrecCards, scryfallThemeResults, rawUpgradeResults] = await Promise.all([
    Promise.all(topEdhrecNames.map((n) => getCardByName(n))).then(
      (results) => results.filter((c): c is ScryfallCard => !!c)
    ),
    getScryfallSuggestions(commander, deckCardsResolved, deckNames, edhrecNames),
    Promise.all(
      upgradeEntries.map(async ([tagKind, sourceCard]) => {
        const q = `${TAG_UPGRADE_QUERIES[tagKind]} legal:commander id<=${ciStr} cmc<${sourceCard.cmc}`;
        try {
          const res = await searchCards(q);
          const candidate = res.data.find((c) => !deckNames.has(c.name.toLowerCase()));
          if (candidate) return { candidate, replaces: sourceCard, tagKind };
        } catch {}
        return null;
      })
    ),
  ]);

  // Deduplicate: same candidate card shouldn't appear as upgrade for multiple tag types
  const seen = new Set<string>();
  const cmcUpgrades = rawUpgradeResults
    .filter((r): r is { candidate: ScryfallCard; replaces: ScryfallCard; tagKind: string } => r !== null)
    .filter(({ candidate }) => {
      const key = candidate.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const suggestions = generateSuggestions({
    deckCards: deckCardsResolved,
    commander,
    recommendations,
    resolvedEdhrecCards,
    budgetFilter,
    scryfallThemeResults,
    cmcUpgrades,
  });

  const deckScore = scoreDeck(deckCardsResolved, recommendations);

  return NextResponse.json({ suggestions, deckScore, recommendations });
}
