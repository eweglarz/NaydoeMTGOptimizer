import { NextRequest, NextResponse } from "next/server";
import { getCommanderTaggerTags, getTaggerTagSuggestions } from "@/lib/scryfallTagger";
import { getCardByNameSafe } from "@/lib/scryfallServer";

// GET /api/debug/tagger?name=Ezio+Auditore+da+Firenze
// Returns the raw tagger tags and first-pass search results for a commander.
// Remove this file before deploying to production.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "Ezio Auditore da Firenze";

  const commander = await getCardByNameSafe(name);
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  const ciStr = commander.color_identity.length > 0
    ? commander.color_identity.map((c) => c.toLowerCase()).join("")
    : "c";

  const tags = await getCommanderTaggerTags(commander);

  const tagResults = await getTaggerTagSuggestions(tags, ciStr, new Set());

  return NextResponse.json({
    commander: commander.name,
    set: commander.set,
    collector_number: commander.collector_number,
    ciStr,
    tags,
    tagResults: tagResults.map((r) => ({
      tag: r.tag,
      cardCount: r.cards.length,
      firstThree: r.cards.slice(0, 3).map((c) => c.name),
    })),
  });
}
