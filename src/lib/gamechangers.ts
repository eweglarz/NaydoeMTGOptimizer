// Official Commander Brackets "Game Changers" list
// Source: Commander Brackets (commanderbrackets.com)
export const GAME_CHANGER_CARDS = new Set([
  // White
  "drannith magistrate",
  "enlightened tutor",
  "farewell",
  "humility",
  "serra's sanctum",
  "smothering tithe",
  "teferi's protection",

  // Blue
  "consecrated sphinx",
  "cyclonic rift",
  "force of will",
  "fierce guardianship",
  "gifts ungiven",
  "intuition",
  "mystical tutor",
  "narset, parter of veils",
  "rhystic study",
  "thassa's oracle",

  // Black
  "ad nauseam",
  "bolas's citadel",
  "braids, cabal minion",
  "demonic tutor",
  "imperial seal",
  "necropotence",
  "opposition agent",
  "orcish bowmasters",
  "tergrid, god of fright",
  "vampiric tutor",

  // Red
  "gamble",
  "jeska's will",
  "underworld breach",

  // Green
  "biorhythm",
  "crop rotation",
  "gaea's cradle",
  "natural order",
  "seedborn muse",
  "survival of the fittest",
  "worldly tutor",

  // Multicolor
  "aura shards",
  "coalition victory",
  "grand arbiter augustin iv",
  "notion thief",

  // Colorless
  "ancient tomb",
  "chrome mox",
  "field of the dead",
  "glacial chasm",
  "grim monolith",
  "lion's eye diamond",
  "mana vault",
  "mishra's workshop",
  "mox diamond",
  "panoptic mirror",
  "the one ring",
  "the tabernacle at pendrell vale",
]);

export function isGameChanger(cardName: string): boolean {
  return GAME_CHANGER_CARDS.has(cardName.toLowerCase());
}
