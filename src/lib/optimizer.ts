import { ScryfallCard, OptimizationSuggestion, EdhrecRecommendation } from "@/types/mtg";
import { getCardPrice, getBudgetTier } from "./scryfall";
import { isGameChanger } from "./gamechangers";
import { ScryfallThemeResult } from "./scryfallSynergy";


interface OptimizerInput {
  deckCards: ScryfallCard[];
  commander: ScryfallCard;
  recommendations: EdhrecRecommendation;
  resolvedEdhrecCards: ScryfallCard[];
  budgetFilter?: "all" | "budget" | "mid" | "expensive";
  scryfallThemeResults?: ScryfallThemeResult[];
  /** Pre-fetched CMC-based upgrade pairs: lower-CMC Scryfall alternatives per function category */
  cmcUpgrades?: Array<{ candidate: ScryfallCard; replaces: ScryfallCard; tagKind: string }>;
}

export function generateSuggestions({
  deckCards,
  recommendations,
  resolvedEdhrecCards,
  budgetFilter = "all",
  scryfallThemeResults = [],
  cmcUpgrades = [],
}: OptimizerInput): OptimizationSuggestion[] {
  const deckNames = new Set(deckCards.map((c) => c.name.toLowerCase()));
  const suggestions: OptimizationSuggestion[] = [];

  const edhrecMap = new Map(
    recommendations.cards.map((c) => [c.name.toLowerCase(), c])
  );

  // ADD suggestions: high-synergy cards not yet in deck (EDHREC)
  for (const scryfCard of resolvedEdhrecCards) {
    if (deckNames.has(scryfCard.name.toLowerCase())) continue;
    const edrec = edhrecMap.get(scryfCard.name.toLowerCase());
    if (!edrec) continue;

    const price = getCardPrice(scryfCard);
    const tier = getBudgetTier(price);

    if (budgetFilter !== "all" && tier !== budgetFilter) continue;

    const isHighSynergy = edrec.synergy_score != null && edrec.synergy_score > 0.2;
    const gc = isGameChanger(scryfCard.name);

    const pct = Math.round(edrec.inclusion_rate * 100);
    suggestions.push({
      type: "add",
      card: scryfCard,
      isGameChanger: gc,
      reason: gc
        ? `Commander Brackets Game Changer — in ${edrec.num_decks.toLocaleString()} decks (${pct}%)`
        : isHighSynergy
        ? `High synergy — ${Math.round((edrec.synergy_score ?? 0) * 100)}% above average for this commander`
        : `Widely played — in ${edrec.num_decks.toLocaleString()} decks (${pct}%)`,
      synergyScore: edrec.synergy_score,
      inclusionRate: edrec.inclusion_rate,
      numDecks: edrec.num_decks,
      budgetTier: tier,
      source: "edhrec",
    });
  }

  // CUT suggestions: game changers already in deck (bracket warning) + low-synergy cards
  for (const card of deckCards) {
    const price = getCardPrice(card);
    const tier = getBudgetTier(price);

    if (isGameChanger(card.name)) {
      suggestions.push({
        type: "cut",
        card,
        isGameChanger: true,
        reason: "Commander Brackets Game Changer — raises your deck to bracket 4. Cut if playing in a lower-power game.",
        budgetTier: tier,
        source: "edhrec",
      });
      continue;
    }

    const edrec = edhrecMap.get(card.name.toLowerCase());
    if (!edrec) {
      if (budgetFilter !== "all" && tier !== budgetFilter) continue;
      suggestions.push({
        type: "cut",
        card,
        reason: "No EDHREC presence for this commander — consider cutting for better synergy",
        budgetTier: tier,
        source: "edhrec",
      });
    } else if (edrec.inclusion_rate < 0.05 && (edrec.synergy_score ?? 0) < 0) {
      if (budgetFilter !== "all" && tier !== budgetFilter) continue;
      suggestions.push({
        type: "cut",
        card,
        reason: `Below-average fit — only ${edrec.num_decks.toLocaleString()} decks (${Math.round(edrec.inclusion_rate * 100)}%) with negative synergy`,
        synergyScore: edrec.synergy_score,
        inclusionRate: edrec.inclusion_rate,
        numDecks: edrec.num_decks,
        budgetTier: tier,
        source: "edhrec",
      });
    }
  }

  // UPGRADE suggestions: lower-CMC Scryfall alternatives for the highest-cost (by CMC)
  // functional card in each category (draw, removal, tutor, control, copy, ramp).
  // Candidates are sorted by EDHREC popularity so the top result is most widely played.
  for (const { candidate, replaces, tagKind } of cmcUpgrades) {
    const price = getCardPrice(candidate);
    const tier = getBudgetTier(price);
    if (budgetFilter !== "all" && tier !== budgetFilter) continue;
    suggestions.push({
      type: "upgrade",
      card: candidate,
      reason: `CMC ${candidate.cmc} vs ${replaces.cmc} — lower-cost ${tagKind} effect replacing ${replaces.name} (top EDHREC pick in your colors)`,
      replaces,
      budgetTier: tier,
      source: "scryfall",
    });
  }

  // ADD suggestions from Scryfall advanced search (theme-based, not in EDHREC)
  const addedScryfallNames = new Set<string>();
  for (const { theme, cards } of scryfallThemeResults) {
    for (const card of cards) {
      const key = card.name.toLowerCase();
      if (deckNames.has(key)) continue;
      if (edhrecMap.has(key)) continue; // EDHREC already covers this card
      if (addedScryfallNames.has(key)) continue; // dedup across themes

      const price = getCardPrice(card);
      const tier = getBudgetTier(price);
      if (budgetFilter !== "all" && tier !== budgetFilter) continue;

      addedScryfallNames.add(key);
      suggestions.push({
        type: "add",
        card,
        reason: `Scryfall: matches your deck's "${theme}" strategy`,
        budgetTier: tier,
        source: "scryfall",
        sourceTheme: theme,
        isGameChanger: isGameChanger(card.name),
      });
    }
  }

  // Sort: game changers first → adds (EDHREC by synergy, then Scryfall) → cuts/upgrades
  return suggestions.sort((a, b) => {
    if (a.isGameChanger && !b.isGameChanger) return -1;
    if (b.isGameChanger && !a.isGameChanger) return 1;
    if (a.type === "add" && b.type !== "add") return -1;
    if (b.type === "add" && a.type !== "add") return 1;
    // Within adds: EDHREC before Scryfall, then by synergy score
    if (a.source === "edhrec" && b.source === "scryfall") return -1;
    if (a.source === "scryfall" && b.source === "edhrec") return 1;
    return (b.synergyScore ?? 0) - (a.synergyScore ?? 0);
  });
}

export function scoreDeck(
  deckCards: ScryfallCard[],
  recommendations: EdhrecRecommendation
): { score: number; label: string; details: string } {
  if (!recommendations.cards.length) {
    return { score: 0, label: "Unknown", details: "No EDHREC data available" };
  }

  const edhrecMap = new Map(recommendations.cards.map((c) => [c.name.toLowerCase(), c]));
  let totalSynergy = 0;
  let matched = 0;

  for (const card of deckCards) {
    const e = edhrecMap.get(card.name.toLowerCase());
    if (e) {
      totalSynergy += e.inclusion_rate + (e.synergy_score ?? 0) * 0.5;
      matched++;
    }
  }

  const score = matched === 0 ? 0 : Math.min(100, Math.round((totalSynergy / deckCards.length) * 100));
  const label = score >= 70 ? "Highly Optimized" : score >= 40 ? "Decent Synergy" : "Needs Work";
  const details = `${matched}/${deckCards.length} cards recognized by EDHREC for this commander`;

  return { score, label, details };
}

