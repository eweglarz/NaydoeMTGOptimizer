# NaydoeMTG Optimizer

A Commander/EDH deck optimization tool built with Next.js. Search for commanders, import your deck list, analyze card synergies using EDHREC data, and get actionable suggestions to tune your 99.

---

## Features

### Deck Import

- **Paste List** — paste any standard text deck list (Moxfield export, MTGO format, Arena, plain `1x Card Name` lines)
- **Moxfield URL** — direct URL import (note: Moxfield API returns 403 for unauthenticated requests; use Paste List instead)
- **Partner / Dual Commanders** — auto-detected: `98 cards + blank line + 2 cards` → two commanders; `99 cards + blank line + 1 card` → single commander
- **Sideboard Support** — cards under a `Sideboard:` / `SIDEBOARD:` / `Maybeboard:` header are imported separately and shown in a collapsible sideboard panel below the main deck, with per-card "→ Deck" and remove buttons
- **Dual-Faced Card (DFC) Resolution** — cards queried by front face name (e.g. `Needleverge Pathway`) resolve correctly even when Scryfall's canonical name is `Needleverge Pathway // Pillarverge Pathway`
- **Split Card Normalization** — `Wear/Tear` → `Wear // Tear` automatically
- **Windows Line Ending Tolerance** — `\r\n` pasted from Windows sources is normalized before parsing so blank-line paragraph detection works correctly

#### Supported paste formats

```
// Section-header format (Moxfield text export)
Commander (1)
1 Atraxa, Praetors' Voice

Deck (98)
1 Sol Ring
4 Forest

Sideboard (10)
1 Dockside Extortionist
...

// Blank-line separated (no headers needed)
1 Sol Ring
4 Forest
...

1 Atraxa, Praetors' Voice

// Two-commander blank-line format
1 Sol Ring
...

1 Atreus, Impulsive Son
1 Kratos, Stoic Father

// MTGO inline *CMDR* marker
1 Atraxa, Praetors' Voice *CMDR*
1 Sol Ring
...

// Commander: inline label
Commander: Atraxa, Praetors' Voice
1 Sol Ring
...
```

---

### Deck List View

- Cards grouped by type: **Creatures · Instants · Sorceries · Enchantments · Artifacts · Planeswalkers · Lands · Other**
- Commander(s) shown in their own pinned panel; label reads "Commanders" when a partner is present
- Sort by: **Mana Value · Alphabetical · Price · Color**
- Card count indicator (green at 100/100, yellow when building, red if over)
- Total deck cost
- Progress bar

---

### Card Row Display

Each card row shows (left to right):

1. **Card name** — yellow for commander/partner, gold highlight for Game Changers
2. **★ Game Changer badge** — shown for any card on the Commander Brackets official game-changer list
3. **Mana cost** — colored pip symbols rendered in pure CSS (no external font): W/U/B/R/G/C/X and hybrid mana
4. **⬆ Upgrade button** — appears on hover for cards with searchable function tags (see Upgrades below)
5. **Price** — color-coded: green < $5 · blue $5–$20 · orange ≥ $20
6. **✕ Remove button** — appears on hover

---

### Card Tags

Automatic tags appear below each card name, color-coded by category.

| Tag | Color | Detection |
|---|---|---|
| Keyword abilities | Blue | Scryfall `keywords` array (Flying, Deathtouch, Trample, etc.) |
| Destruction | Red | `destroy target` / `exile target` |
| Board Wipe | Red | `destroy all` / `exile all` |
| Utility | Emerald | Non-land mana producers (`add {`, ramp) |
| Card Draw | Violet | `draw a card / N cards` |
| Life Gain | Rose | `gains N life` on nonland cards |
| Burn | Orange | Deals damage to opponents/players, or makes opponents lose life |
| Tutor | Amber | `search your library for` a nonland card |
| Control | Indigo | Counterspells, stax, `can't cast`, tax effects (`unless ... pays`) |
| Counters | Teal | `+1/+1` or `-1/-1` counter placement |
| Named Counters | Sky | Individual tags for: Experience · Poison · Energy · Oil · Charge · Spore · Lore · Age · Time · Fate · Ice · Level · Flood · Bounty · Acorn · Ki · Feather · Fade · Rust · Study · Verse · Depletion · Blood · Shield · Quest · Infection · Plague |
| Copy | Fuchsia | Copying spells, permanents, or abilities |
| Discard | Zinc | Forces player(s) to discard; also tags draw+discard loot/wheel effects |
| **Creature Types** | *Dim green* | Subtypes parsed from type line (Dragon, Goblin, Merfolk, etc.) — always appear last, styled at 50% opacity so they don't compete visually with functional tags |

---

### Per-Card Upgrade Suggestions

Hovering any non-commander card with at least one functional tag reveals a **⬆** button. Clicking it opens an inline panel that:

- Queries `/api/upgrade` which searches Scryfall for alternatives in the same functional category within your commander's color identity
- Searches are filtered by `legal:commander id<=<color-identity>` and sorted by EDHREC rank
- Results already in your deck are excluded
- Cards with lower mana value than the original show a green **↓ MV N** badge
- Each result shows name · mana cost symbols · price · **+ Add** button (adds to deck and closes panel)
- Hover any suggestion for a full card image preview tooltip

Upgrade search categories map to these Scryfall queries:

| Tag kind | Query |
|---|---|
| draw | `o:"draw" -t:land` |
| removal | destroy/exile target or all |
| tutor | `o:"search your library for" -t:land` |
| control | counter target spell, can't cast, tax |
| counters | `+1/+1 counter` effects |
| copy | create a copy / copy target |
| utility | `o:"add {"` (ramp) |

---

### Optimizer (EDHREC + Scryfall Synergy)

Click **✨ Optimize Deck** to run the full optimizer:

- **Deck Score** — 0–100 EDHREC synergy score for the current 99
- **Add suggestions** — high-synergy cards not yet in your deck
- **Cut suggestions** — low-synergy or zero-EDHREC-presence cards
- **Upgrade suggestions** — cheaper or stronger alternatives to existing cards
- **Game Changer flags** — high-impact cards identified per Commander Brackets guidelines
- **Filters**: Add / Cut / Upgrade · Budget / Mid / Expensive · card type

---

### Buy List

The **Buy Cards** tab generates a consolidated buy list of all cards in your deck that you don't yet own, with TCGPlayer links.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Card Data | Scryfall API |
| Synergy Data | EDHREC (unofficial JSON API) |
| Deck Import | Text export parsing (Moxfield, MTGO, Arena, plain text) |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                      # Home — commander search entry point
│   ├── layout.tsx                    # Root layout
│   ├── globals.css                   # Global styles + Tailwind directives
│   └── deck/
│       └── page.tsx                  # Deck builder (3-panel layout, all state)
│   └── api/
│       ├── moxfield/route.ts         # POST: parse text/URL → Scryfall bulk lookup
│       ├── optimize/route.ts         # POST: run optimizer → suggestions + score
│       ├── upgrade/route.ts          # POST: per-card upgrade search via Scryfall
│       ├── edhrec/route.ts           # GET: EDHREC commander data
│       └── scryfall/
│           ├── search/route.ts       # GET: card search proxy
│           └── card/route.ts         # GET: single card by name
├── components/
│   ├── BuyListPanel.tsx              # Buy list with TCGPlayer links
│   ├── CardImage.tsx                 # Next/Image wrapper for Scryfall images
│   ├── CardSearch.tsx                # Card search autocomplete + add to deck
│   ├── CardTooltip.tsx               # Hover tooltip: card image + oracle text
│   ├── CommanderSearch.tsx           # Commander-specific autocomplete search
│   ├── DeckImport.tsx                # Paste-list / Moxfield URL import UI
│   ├── DeckList.tsx                  # Grouped deck list with tags, mana cost,
│   │                                 #   prices, game changer badges, upgrade panel
│   ├── ManaCost.tsx                  # Pure-CSS colored mana pip renderer
│   └── SuggestionPanel.tsx           # Optimizer suggestions with filters
├── lib/
│   ├── scryfall.ts                   # Scryfall API client + card utilities
│   │                                 #   getCardsByNames  — bulk /cards/collection (75/req)
│   │                                 #     + DFC front-face indexing
│   │                                 #     + fuzzy fallback for not_found
│   │                                 #     + canonical-name mismatch re-keying
│   │                                 #   normalizeCardName — "/" → " // "
│   │                                 #   getCardTags       — full tag detection
│   │                                 #   getCardImage, getCardPrice, getBudgetTier
│   │                                 #   groupCardsByType
│   │                                 #   CardTag union type
│   ├── moxfield.ts                   # Text deck list parser
│   │                                 #   tryDetectSeparatedCommanders
│   │                                 #     — blank-line paragraph detection
│   │                                 #     — \r\n normalization
│   │                                 #     — total-card-count commander heuristic
│   │                                 #     — 2-paragraph and 3-paragraph formats
│   │                                 #     — sideboard header detection (SIDEBOARD_HEADER_RE)
│   │                                 #   parseTextDeckList — section-header line parser
│   ├── optimizer.ts                  # Suggestion + deck score logic
│   ├── edhrec.ts                     # EDHREC data fetching + slugification
│   ├── scryfallSynergy.ts            # Scryfall-based synergy fallback search
│   └── gamechangers.ts               # Commander Brackets game changer list
└── types/
    └── mtg.ts                        # TypeScript interfaces
                                      #   ScryfallCard, DeckCard, OptimizationSuggestion
                                      #   EdhrecCard, EdhrecRecommendation, etc.
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
- **Bulk name lookup**: `POST /cards/collection` — up to 75 identifiers per request; DFCs indexed by both canonical name and front-face name
- **Single card**: `GET /cards/named?exact=` with `?fuzzy=` fallback; also re-keys under the queried name to handle canonical-name mismatches (collaboration cards, etc.)
- **Search**: `GET /cards/search?q=&order=edhrec` — used for upgrade suggestions
- **Autocomplete**: `GET /cards/autocomplete?q=`
- **Image CDN**: `cards.scryfall.io`, `c1.scryfall.com`
- Responses are cached for 1 hour via Next.js `revalidate: 3600`
- `User-Agent` header identifies the app per Scryfall's API policy

### EDHREC (unofficial)

- Fetched server-side from `https://json.edhrec.com/pages/commanders/<slug>.json`
- Commander name slugified: lowercase, spaces → hyphens, punctuation stripped
- Returns inclusion rates, synergy scores, deck counts, high-synergy card lists
- No API key required; treat as best-effort (endpoint may change without notice)

### Moxfield

- Direct URL import blocked (403 for unauthenticated requests)
- Use Moxfield's **Export → Text** and paste via the Paste List tab
- All standard Moxfield text export formats are supported including `(SET) ###` collector info suffixes, which are stripped during parse

---

## Known Limitations

- EDHREC unofficial API may return stale data or be temporarily unavailable; the optimizer falls back to Scryfall synergy search in that case
- Moxfield direct URL import is blocked — text export is required
- Scryfall bulk endpoint resolves up to 75 names per request; large decks use multiple requests with fuzzy fallback for any unresolved names
- Very new or niche cards (some Universes Beyond collaborations) may not be in Scryfall's database and will be silently skipped

---

## License

Private — all rights reserved.
