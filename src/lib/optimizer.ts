import { ScryfallCard, OptimizationSuggestion, EdhrecRecommendation } from "@/types/mtg";
import { getCardPrice, getBudgetTier } from "./scryfall";
import { isGameChanger } from "./gamechangers";
import { ScryfallThemeResult } from "./scryfallSynergy";
import { TaggerTagResult } from "./scryfallTagger";


interface OptimizerInput {
  deckCards: ScryfallCard[];
  commander: ScryfallCard;
  recommendations: EdhrecRecommendation;
  resolvedEdhrecCards: ScryfallCard[];
  budgetFilter?: "all" | "budget" | "mid" | "expensive";
  scryfallThemeResults?: ScryfallThemeResult[];
  /** Pre-fetched CMC-based upgrade pairs: lower-CMC Scryfall alternatives per function category */
  cmcUpgrades?: Array<{ candidate: ScryfallCard; replaces: ScryfallCard; tagKind: string }>;
  /** Per-tag results from Scryfall Tagger search */
  taggerTagResults?: TaggerTagResult[];
}

export function generateSuggestions({
  deckCards,
  recommendations,
  resolvedEdhrecCards,
  budgetFilter = "all",
  scryfallThemeResults = [],
  cmcUpgrades = [],
  taggerTagResults = [],
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

  // Track names already in suggestions to deduplicate tagger results.
  // Cards already suggested via EDHREC won't appear again as tagger suggestions,
  // but cards in the EDHREC dataset that weren't shown (outside the top-60 resolved
  // set) can appear as tagger suggestions and have their inclusion data used for scoring.
  const alreadySuggested = new Set(suggestions.map((s) => s.card.name.toLowerCase()));

  // ADD suggestions from Scryfall Tagger tag search.
  // Cards are merged across tags so a card matching multiple tags shows all of them.
  // Backend score per suggestion:
  //   +10  per primary (directly-applied "oracle") tag match
  //   +5   per inherited/pendant tag match
  //   +2   additional per "synergy-" prefixed slug
  //   -0.5 × CMC  (lower mana cost rewarded)
  //   +15 × inclusionRate  if card has EDHREC inclusion data for this commander
  //   +5  × synergyScore   if EDHREC synergy is positive
  if (taggerTagResults.length > 0) {
    type TagData = { slug: string; name: string; isPrimary: boolean };
    const taggerCardMap = new Map<string, ScryfallCard>();
    const taggerCardTagData = new Map<string, TagData[]>();

    for (const { tag, cards } of taggerTagResults) {
      for (const card of cards) {
        const key = card.name.toLowerCase();
        if (!taggerCardMap.has(key)) taggerCardMap.set(key, card);
        const existing = taggerCardTagData.get(key);
        const entry: TagData = { slug: tag.slug, name: tag.name, isPrimary: tag.isPrimary };
        if (existing) {
          if (!existing.some((t) => t.slug === tag.slug)) existing.push(entry);
        } else {
          taggerCardTagData.set(key, [entry]);
        }
      }
    }

    const taggerSuggestions: Array<{ suggestion: OptimizationSuggestion; score: number }> = [];

    for (const [key, tagData] of taggerCardTagData) {
      if (deckNames.has(key)) continue;
      if (alreadySuggested.has(key)) continue;

      const card = taggerCardMap.get(key)!;
      const price = getCardPrice(card);
      const tier = getBudgetTier(price);
      if (budgetFilter !== "all" && tier !== budgetFilter) continue;

      // Tag-based score
      let score = 0;
      for (const t of tagData) {
        score += t.isPrimary ? 10 : 5;
        if (t.slug.startsWith("synergy-")) score += 2;
        if (t.slug === "evasion") score -= 8;
      }
      score -= card.cmc * 0.5;

      // EDHREC commander-specific bonus
      const edhrecData = edhrecMap.get(key);
      if (edhrecData) {
        score += edhrecData.inclusion_rate * 15;
        if ((edhrecData.synergy_score ?? 0) > 0) score += edhrecData.synergy_score! * 5;
      }

      const matchedNames = tagData.map((t) => t.name);
      const tagLabel =
        matchedNames.length === 1
          ? `"${matchedNames[0]}"`
          : `${matchedNames.length} tags (${matchedNames.slice(0, 3).join(", ")}${matchedNames.length > 3 ? "…" : ""})`;

      const edhrecSuffix = edhrecData
        ? ` · ${Math.round(edhrecData.inclusion_rate * 100)}% of EDHREC decks`
        : "";

      taggerSuggestions.push({
        suggestion: {
          type: "add" as const,
          card,
          reason: `Shares ${tagLabel} with your commander (Scryfall Tagger)${edhrecSuffix}`,
          budgetTier: tier,
          source: "tagger" as const,
          sourceTheme: matchedNames.join(", "),
          taggerTags: matchedNames,
          taggerScore: score,
          inclusionRate: edhrecData?.inclusion_rate,
          numDecks: edhrecData?.num_decks,
          synergyScore: edhrecData?.synergy_score,
          isGameChanger: isGameChanger(card.name),
        },
        score,
      });
    }

    // Sort tagger suggestions by score descending before appending
    taggerSuggestions.sort((a, b) => b.score - a.score);
    for (const { suggestion } of taggerSuggestions) suggestions.push(suggestion);
  }

  // Sort: game changers first → adds (EDHREC → tagger → scryfall) → cuts/upgrades
  // Within tagger adds, preserve the score-based order above.
  return suggestions.sort((a, b) => {
    if (a.isGameChanger && !b.isGameChanger) return -1;
    if (b.isGameChanger && !a.isGameChanger) return 1;
    if (a.type === "add" && b.type !== "add") return -1;
    if (b.type === "add" && a.type !== "add") return 1;
    // Within adds: EDHREC > tagger > scryfall
    const sourceOrder = (s: string | undefined) =>
      s === "edhrec" ? 0 : s === "tagger" ? 1 : 2;
    const diff = sourceOrder(a.source) - sourceOrder(b.source);
    if (diff !== 0) return diff;
    // Within same source: EDHREC by synergy score, tagger by taggerScore
    if (a.source === "tagger") return (b.taggerScore ?? 0) - (a.taggerScore ?? 0);
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

