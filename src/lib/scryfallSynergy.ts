import { ScryfallCard } from "@/types/mtg";
import { searchCards } from "./scryfall";

interface DetectedTheme {
  name: string;
  query: string;
  score: number;
}

export interface ScryfallThemeResult {
  theme: string;
  cards: ScryfallCard[];
}

function getOracleText(card: ScryfallCard): string {
  return [
    card.oracle_text ?? "",
    ...(card.card_faces?.map((f) => f.oracle_text ?? "") ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, p) => n + (text.match(p) ?? []).length, 0);
}

function colorIdentityConstraint(ci: string[]): string {
  if (ci.length === 0) return "id:C";
  return `id<=${ci.join("")}`;
}

export function detectThemes(
  commander: ScryfallCard,
  deckCards: ScryfallCard[]
): DetectedTheme[] {
  const allOracle = [commander, ...deckCards].map(getOracleText).join("\n");

  const creatures = deckCards.filter((c) => c.type_line.includes("Creature"));
  const instants = deckCards.filter((c) => c.type_line.includes("Instant"));
  const sorceries = deckCards.filter((c) => c.type_line.includes("Sorcery"));
  const artifacts = deckCards.filter((c) => c.type_line.includes("Artifact"));
  const enchantments = deckCards.filter((c) => c.type_line.includes("Enchantment"));

  const candidates: DetectedTheme[] = [];

  // ETB — payoffs and flicker
  const etb = countMatches(allOracle, [
    /enters the battlefield/g,
    /whenever .{0,40} enters/g,
  ]);
  if (etb >= 4) {
    candidates.push({
      name: "ETB Triggers",
      query: 'o:"enters the battlefield" o:"whenever"',
      score: etb,
    });
  }

  // +1/+1 counters / proliferate
  const counters = countMatches(allOracle, [/\+1\/\+1 counter/g, /proliferate/g]);
  if (counters >= 3) {
    candidates.push({
      name: "+1/+1 Counters",
      query: 'o:"+1/+1 counter"',
      score: counters,
    });
  }

  // Token generation
  const tokens = countMatches(allOracle, [/create .{0,30}token/g]);
  if (tokens >= 3) {
    candidates.push({
      name: "Tokens",
      query: 'o:"create" o:"token" o:"whenever"',
      score: tokens,
    });
  }

  // Spellslinger
  const spells = instants.length + sorceries.length;
  if (spells >= 12) {
    candidates.push({
      name: "Spellslinger",
      query: 'o:"instant or sorcery"',
      score: spells,
    });
  }

  // Graveyard recursion
  const gy = countMatches(allOracle, [
    /from (your|a) graveyard/g,
    /graveyard to (your hand|the battlefield)/g,
    /return .{0,20} from your graveyard/g,
  ]);
  if (gy >= 3) {
    candidates.push({
      name: "Graveyard",
      query: 'o:"graveyard" o:"return"',
      score: gy,
    });
  }

  // Sacrifice / aristocrats
  const sac = countMatches(allOracle, [
    /sacrifice (a|an|target|another|one or more)/g,
  ]);
  if (sac >= 3) {
    candidates.push({
      name: "Sacrifice",
      query: 'o:"sacrifice" o:"whenever"',
      score: sac,
    });
  }

  // Lifegain
  const lifegain = countMatches(allOracle, [
    /you gain \d+ life/g,
    /whenever you gain life/g,
    /gain \d+ life/g,
  ]);
  if (lifegain >= 3) {
    candidates.push({
      name: "Lifegain",
      query: 'o:"gain life" o:"whenever"',
      score: lifegain,
    });
  }

  // Artifacts matter
  if (artifacts.length >= 10) {
    candidates.push({
      name: "Artifacts",
      query: 'o:"artifact" o:"whenever"',
      score: artifacts.length,
    });
  }

  // Landfall
  const landfall = countMatches(allOracle, [
    /landfall/g,
    /whenever a land enters/g,
  ]);
  if (landfall >= 3) {
    candidates.push({
      name: "Landfall",
      query: 'o:"landfall"',
      score: landfall * 4,
    });
  }

  // Tribal — find the most common creature subtype
  const subtypeCounts = new Map<string, number>();
  const SKIP_SUBTYPES = new Set(["token", "creature", "legendary", "snow"]);
  for (const card of creatures) {
    const dash = card.type_line.indexOf("—");
    if (dash !== -1) {
      for (const sub of card.type_line.slice(dash + 1).trim().split(/\s+/)) {
        const s = sub.trim();
        if (s.length >= 3 && !SKIP_SUBTYPES.has(s.toLowerCase())) {
          subtypeCounts.set(s, (subtypeCounts.get(s) ?? 0) + 1);
        }
      }
    }
  }
  const topTribe = [...subtypeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topTribe && topTribe[1] >= 4) {
    candidates.push({
      name: `${topTribe[0]} Tribal`,
      query: `t:${topTribe[0]}`,
      score: topTribe[1] * 3,
    });
  }

  // Equipment / Voltron
  const equip = deckCards.filter((c) => c.type_line.includes("Equipment")).length;
  const equipOracle = countMatches(getOracleText(commander), [
    /equipped creature/g,
    /\battach\b/g,
  ]);
  if (equip >= 3 || equipOracle >= 2) {
    candidates.push({
      name: "Equipment",
      query: "t:equipment",
      score: equip * 2 + equipOracle,
    });
  }

  // Enchantress
  const enchantCount =
    enchantments.length +
    countMatches(allOracle, [/whenever you (cast|play) an enchantment/g]);
  if (enchantCount >= 10) {
    candidates.push({
      name: "Enchantments",
      query: 'o:"enchantment" o:"whenever"',
      score: enchantCount,
    });
  }

  // Flicker / Blink
  const blink = countMatches(allOracle, [
    /exile .{0,40}then return/g,
    /\bflicker\b/g,
  ]);
  if (blink >= 3) {
    candidates.push({
      name: "Flicker/Blink",
      query: 'o:"exile" o:"return it to the battlefield"',
      score: blink * 2,
    });
  }

  // Draw engine support
  const drawCount = countMatches(allOracle, [
    /draw (a card|two cards|\d+ cards)/g,
  ]);
  if (drawCount >= 6) {
    candidates.push({
      name: "Card Draw",
      query: 'o:"draw" o:"whenever"',
      score: drawCount,
    });
  }

  // Return top 4 by score
  return candidates.sort((a, b) => b.score - a.score).slice(0, 4);
}

export async function getScryfallSuggestions(
  commander: ScryfallCard,
  deckCards: ScryfallCard[],
  deckNames: Set<string>,
  edhrecNames: Set<string>
): Promise<ScryfallThemeResult[]> {
  const themes = detectThemes(commander, deckCards);
  if (themes.length === 0) return [];

  const ci = colorIdentityConstraint(commander.color_identity);

  const results = await Promise.all(
    themes.map(async (theme): Promise<ScryfallThemeResult> => {
      const query = `${theme.query} ${ci} legal:commander -type:land`;
      try {
        const res = await searchCards(query);
        const seen = new Set<string>();
        const cards: ScryfallCard[] = [];
        for (const card of res.data) {
          const key = card.name.toLowerCase();
          if (
            !deckNames.has(key) &&
            !edhrecNames.has(key) &&
            !seen.has(key)
          ) {
            seen.add(key);
            cards.push(card);
            if (cards.length >= 15) break;
          }
        }
        return { theme: theme.name, cards };
      } catch {
        return { theme: theme.name, cards: [] };
      }
    })
  );

  return results.filter((r) => r.cards.length > 0);
}
