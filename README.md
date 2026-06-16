# NaydoeMTG Optimizer

A Commander/EDH deck optimization tool built with Next.js. Search for commanders, import your deck list, analyze card synergies using EDHREC data, and get actionable suggestions to tune your 99.

---

## Features

- **Commander Search** — autocomplete search for any legal Commander
- **Partner Commanders** — supports two-commander (partner) decks
- **Deck Import** — paste any standard text deck list (Moxfield export, MTGO format, plain `1x Card Name` lines)
- **Deck List View** — cards grouped by type (Creatures, Instants, Sorceries, Enchantments, Artifacts, Planeswalkers, Lands), sorted by CMC
- **Card Tags** — automatic ability tags on each card:
  - Keyword abilities: Flying, Deathtouch, Trample, Haste, Vigilance, Flash, etc.
  - `Destruction` — targeted removal ("destroy/exile target ...")
  - `Board Wipe` — sweepers ("destroy/exile all/each ...")
  - `Utility` — non-land mana producers (mana rocks, dorks)
  - `Card Draw` — cards with draw effects
- **Card Preview Tooltip** — hover any card in the deck list to see the card image and oracle text
- **Deck Score** — EDHREC-based synergy score (0–100) for your current 99
- **Optimizer Suggestions** — EDHREC-powered recommendations:
  - ➕ **Add** — high-synergy cards not in your deck
  - ✂️ **Cut** — low-synergy or no-EDHREC-presence cards to remove
  - ⬆️ **Upgrade** — budget alternatives that match or beat the synergy of pricier cards
  - ⭐/⚠️ **Game Changers** — Commander Brackets official high-impact cards (flagged for bracket awareness)
- **Suggestion Filters** — filter by type (Add / Cut / Upgrade), budget tier (Budget / Mid / Expensive), and card type (Creatures / Instants / etc.)
- **Budget Tiers**:
  - Budget: < $5
  - Mid: $5–$20
  - Expensive: ≥ $20
- **Live Price Display** — USD prices from Scryfall on every card row

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Card Data | Scryfall API |
| Synergy Data | EDHREC (unofficial JSON API) |
| Deck Import | Text export parsing (Moxfield, MTGO, plain text) |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Home page — commander search + deck import
│   ├── layout.tsx                # Root layout
│   └── deck/
│       └── page.tsx              # Deck builder page (3-panel layout)
│   └── api/
│       ├── moxfield/route.ts     # POST: parse text deck list → Scryfall lookup
│       ├── optimize/route.ts     # POST: run optimizer, return suggestions + score
│       ├── edhrec/route.ts       # GET: fetch EDHREC data for a commander
│       └── scryfall/
│           ├── search/route.ts   # GET: card search proxy
│           └── card/route.ts     # GET: single card by name
├── components/
│   ├── CardImage.tsx             # Next/Image wrapper for Scryfall card images
│   ├── CardSearch.tsx            # Card search autocomplete + add to deck
│   ├── CardTooltip.tsx           # Hover tooltip: card image + oracle text
│   ├── CommanderSearch.tsx       # Commander-specific search autocomplete
│   ├── DeckImport.tsx            # Paste-list import UI
│   ├── DeckList.tsx              # Grouped deck list with tags, prices, remove
│   └── SuggestionPanel.tsx       # Optimization suggestions panel with filters
├── lib/
│   ├── scryfall.ts               # Scryfall API client + card utilities
│   │                             #   getCardsByNames (bulk /cards/collection)
│   │                             #   normalizeCardName (split card "/" → " // ")
│   │                             #   getCardTags, getBudgetTier, groupCardsByType
│   ├── edhrec.ts                 # EDHREC data fetching + slugification
│   ├── moxfield.ts               # Text deck list parser
│   ├── optimizer.ts              # Suggestion + score generation logic
│   └── gamechangers.ts           # Commander Brackets game changer list
└── types/
    └── mtg.ts                    # TypeScript interfaces (ScryfallCard, Deck, etc.)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

---

## External APIs

### Scryfall

- **Base URL**: `https://api.scryfall.com`
- **Bulk name lookup**: `POST /cards/collection` — up to 75 card names per request
- **Single card**: `GET /cards/named?exact=` with fuzzy fallback (`?fuzzy=`)
- **Search**: `GET /cards/search?q=`
- **Autocomplete**: `GET /cards/autocomplete?q=`
- **Image CDN**: `cards.scryfall.io`, `c1.scryfall.com`
- Card images are served via Next.js `<Image>` with `unoptimized` (Scryfall CDN handles resizing)
- Scryfall's `User-Agent` policy requires identifying your app in the header

### EDHREC (unofficial)

- Fetched server-side via the undocumented `https://json.edhrec.com/pages/commanders/<slug>.json` endpoint
- Commander name is slugified (lowercase, spaces → hyphens, special chars stripped)
- Returns inclusion rates, synergy scores, deck counts, and high-synergy card lists
- No API key required; treat this as a best-effort integration (endpoint may change)

### Moxfield

- The Moxfield API returns 403 for unauthenticated requests
- Use Moxfield's **Export → Text** feature and paste the result into the "Paste List" import
- The text parser handles: `Commander (1)` / `Deck (98)` headers, `Commander: Name` inline, MTGO `*COMMANDER*` markers, `1x Card Name (SET) 123` lines, and partner commanders

---

## Import Format

The paste import accepts any of these common formats:

```
// Moxfield / plain text export
Commander (1)
1 Atraxa, Praetors' Voice

Deck (98)
1 Sol Ring
4 Forest
...

// MTGO export
1 Atraxa, Praetors' Voice *CMDR*
1 Sol Ring
...

// Commander: inline label
Commander: Atraxa, Praetors' Voice
1 Sol Ring
...
```

Split/DFC card names using `/` (e.g. `Gallifrey Falls/No More`) are automatically normalized to Scryfall's `//` format.

---

## Known Limitations

- EDHREC's unofficial API may occasionally return stale data or be unavailable
- Moxfield direct URL import is blocked (403) — text export required
- Partner commanders imported via text export are fully supported; however, decks with no section headers may not auto-detect both commanders
- Scryfall bulk endpoint (`/cards/collection`) resolves up to 75 names per request; a 99-card deck requires 2 requests. Any unresolved cards fall back to individual fuzzy lookup

---

## License

Private — all rights reserved.
