import { ScryfallCard, OptimizationSuggestion, EdhrecRecommendation } from "@/types/mtg";
import { getCardPrice, getBudgetTier } from "./scryfall";
import { isGameChanger } from "./gamechangers";

const MID_THRESHOLD = 10;

interface OptimizerInput {
  deckCards: ScryfallCard[];
  commander: ScryfallCard;
  recommendations: EdhrecRecommendation;
  resolvedEdhrecCards: ScryfallCard[];
  budgetFilter?: "all" | "budget" | "mid" | "expensive";
}

export function generateSuggestions({
  deckCards,
  recommendations,
  resolvedEdhrecCards,
  budgetFilter = "all",
}: OptimizerInput): OptimizationSuggestion[] {
  const deckNames = new Set(deckCards.map((c) => c.name.toLowerCase()));
  const suggestions: OptimizationSuggestion[] = [];

  const edhrecMap = new Map(
    recommendations.cards.map((c) => [c.name.toLowerCase(), c])
  );

  // ADD suggestions: high-synergy cards not yet in deck
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
      });
    }
  }

  // UPGRADE suggestions: cards in deck with budget alternatives having higher synergy
  for (const card of deckCards) {
    const price = getCardPrice(card);
    if (price === null || price < MID_THRESHOLD) continue;

    const edrec = edhrecMap.get(card.name.toLowerCase());
    const cardSynergy = edrec?.synergy_score ?? 0;

    const betterBudget = resolvedEdhrecCards.find((candidate) => {
      if (deckNames.has(candidate.name.toLowerCase())) return false;
      const cp = getCardPrice(candidate);
      if (cp === null || cp >= price * 0.5) return false;
      const ce = edhrecMap.get(candidate.name.toLowerCase());
      return ce && (ce.synergy_score ?? 0) >= cardSynergy;
    });

    if (betterBudget) {
      const tier = getBudgetTier(getCardPrice(betterBudget));
      if (budgetFilter !== "all" && tier !== budgetFilter) continue;
      suggestions.push({
        type: "upgrade",
        card: betterBudget,
        reason: `Budget upgrade for ${card.name} — similar or better synergy at a lower price`,
        replaces: card,
        budgetTier: tier,
      });
    }
  }

  // Sort: game changers first, then other adds, then cuts/upgrades
  return suggestions.sort((a, b) => {
    if (a.isGameChanger && !b.isGameChanger) return -1;
    if (b.isGameChanger && !a.isGameChanger) return 1;
    if (a.type === "add" && b.type !== "add") return -1;
    if (b.type === "add" && a.type !== "add") return 1;
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

