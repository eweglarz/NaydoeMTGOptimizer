import { ScryfallCard } from "@/types/mtg";
import { hasOracleTagData, getLocalCardsByTag } from "./oracleTagDb";

export interface TaggerTag {
  name: string;
  slug: string;
  /** True when the tag is directly applied (type "oracle"); false for inherited/pendant tags */
  isPrimary: boolean;
}

interface RawTag {
  name: string;
  slug: string;
  type?: string;
  namespace?: string;
}

const GRAPHQL_QUERY = `
  query FetchCard($set: String!, $number: String!, $back: Boolean) {
    card: cardBySet(set: $set, number: $number, back: $back) {
      taggings {
        tag {
          name
          slug
          type
          namespace
        }
      }
    }
  }
`;

// Scryfall Tagger's GraphQL endpoint requires a CSRF token and session cookie.
// We do a 2-step fetch: GET the card page to collect credentials, then POST GraphQL.
export async function getCommanderTaggerTags(commander: ScryfallCard): Promise<TaggerTag[]> {
  const set = commander.set;
  const number = commander.collector_number;
  if (!set || !number) return [];

  const cardUrl = `https://tagger.scryfall.com/card/${set}/${number}`;
  const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (compatible; NaydoeMTGOptimizer/1.0)",
  };

  try {
    // Step 1: GET the card page → CSRF token + session cookie
    const getRes = await fetch(cardUrl, {
      headers: { ...commonHeaders, Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    console.log("[tagger] GET", cardUrl, "→", getRes.status);
    if (!getRes.ok) return [];

    const html = await getRes.text();
    const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
    console.log("[tagger] CSRF token found:", Boolean(csrf));
    if (!csrf) return [];

    // Extract session cookie — try getSetCookie() (Node 18.14+) then fall back to get()
    const h = getRes.headers as unknown as Record<string, unknown>;
    const rawSetCookie: string =
      typeof h["getSetCookie"] === "function"
        ? (h["getSetCookie"] as () => string[])().join("; ")
        : (getRes.headers.get("set-cookie") ?? "");
    const sessionValue = rawSetCookie.match(/_scryfall_tagger_session=([^;,\s]+)/)?.[1];
    const cookieHeader = sessionValue ? `_scryfall_tagger_session=${sessionValue}` : "";
    console.log("[tagger] Session cookie found:", Boolean(sessionValue));

    // Step 2: POST GraphQL with CSRF token + session cookie
    const postRes = await fetch("https://tagger.scryfall.com/graphql", {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": csrf,
        Origin: "https://tagger.scryfall.com",
        Referer: cardUrl,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        operationName: "FetchCard",
        variables: { set, number, back: false },
        query: GRAPHQL_QUERY,
      }),
      cache: "no-store",
    });

    console.log("[tagger] POST graphql →", postRes.status);
    if (!postRes.ok) {
      const errText = await postRes.text().catch(() => "");
      console.log("[tagger] POST error body:", errText.slice(0, 200));
      return [];
    }

    const json = await postRes.json() as {
      data?: { card?: { taggings?: Array<{ tag: RawTag }> } };
    };

    const tags = (json.data?.card?.taggings ?? [])
      .map((t) => t.tag)
      .filter((t) => (t.namespace ?? "").toLowerCase() === "card" && Boolean(t.slug))
      .map((t) => ({
        name: t.name,
        slug: t.slug,
        isPrimary: (t.type ?? "").toLowerCase() === "oracle",
      }));

    console.log("[tagger] Card tags found:", tags.map((t) => t.slug));
    return tags;
  } catch (err) {
    console.error("[tagger] Error:", err);
    return [];
  }
}

export interface TaggerTagResult {
  tag: TaggerTag;
  cards: ScryfallCard[];
}

// For each tag slug, look up matching cards in the local oracle_tag_index DB.
// Returns empty if the DB hasn't been synced yet (run POST /api/admin/sync-oracle-tags).
// Cards already in the deck are excluded; EDHREC dedup is handled in the optimizer
// so that commander-specific inclusion data can be used for scoring.
export function getTaggerTagSuggestions(
  tags: TaggerTag[],
  ciStr: string,
  deckNames: Set<string>
): TaggerTagResult[] {
  if (tags.length === 0) return [];

  if (!hasOracleTagData()) {
    console.warn("[tagger] oracle_tag_index not found — run POST /api/admin/sync-oracle-tags to enable tagger suggestions");
    return [];
  }

  const results: TaggerTagResult[] = [];
  for (const tag of tags.slice(0, 8)) {
    const cards = getLocalCardsByTag(tag.slug, ciStr, deckNames, 20);
    console.log(`[tagger] local: ${tag.slug} → ${cards.length} cards`);
    if (cards.length > 0) results.push({ tag, cards });
  }
  return results;
}
