"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScryfallCard } from "@/types/mtg";
import CardImage from "./CardImage";

interface Props {
  onSelect: (card: ScryfallCard) => void;
  placeholder?: string;
  label?: string;
}

type DropdownMode = "autocomplete" | "results";

export default function CommanderSearch({
  onSelect,
  placeholder = "Search commanders...",
  label = "Choose Commander",
}: Props) {
  const [query, setQuery] = useState("");
  const [autocompleteNames, setAutocompleteNames] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [mode, setMode] = useState<DropdownMode>("autocomplete");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live autocomplete names as user types
  const fetchAutocomplete = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setAutocompleteNames([]);
      setOpen(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/scryfall/search?q=${encodeURIComponent(q)}&mode=autocomplete`
      );
      const data = (await res.json()) as { data: string[] };
      const names = data.data ?? [];
      setAutocompleteNames(names);
      setMode("autocomplete");
      setOpen(names.length > 0);
      setHighlighted(-1);
    } catch {
      // silent — don't break the UI
    }
  }, []);

  // Full commander search (triggered by Search button / Enter)
  const runCommanderSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch(
        `/api/scryfall/search?q=${encodeURIComponent(q)}&mode=commander`
      );
      const data = (await res.json()) as { data: ScryfallCard[] };
      const cards = data.data ?? [];
      setSearchResults(cards);
      setMode("results");
      setOpen(cards.length > 0);
      setHighlighted(-1);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce autocomplete on every keystroke
  useEffect(() => {
    if (autocompleteDebounce.current) clearTimeout(autocompleteDebounce.current);
    autocompleteDebounce.current = setTimeout(() => fetchAutocomplete(query), 180);
  }, [query, fetchAutocomplete]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Selecting a card by name — fetches full data then calls onSelect
  const selectByName = useCallback(
    async (name: string) => {
      setQuery(name);
      setOpen(false);
      setLoading(true);
      try {
        const res = await fetch(`/api/scryfall/card?name=${encodeURIComponent(name)}`);
        const card = (await res.json()) as ScryfallCard;
        if (card?.id) onSelect(card);
      } finally {
        setLoading(false);
      }
    },
    [onSelect]
  );

  // Selecting a full ScryfallCard directly (from search results)
  const selectCard = useCallback(
    (card: ScryfallCard) => {
      setQuery(card.name);
      setOpen(false);
      setSearchResults([]);
      setAutocompleteNames([]);
      onSelect(card);
    },
    [onSelect]
  );

  const currentList = mode === "autocomplete" ? autocompleteNames : searchResults;
  const listLength = currentList.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || listLength === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (autocompleteDebounce.current) clearTimeout(autocompleteDebounce.current);
        runCommanderSearch(query);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, listLength - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0) {
        if (mode === "autocomplete") {
          selectByName(autocompleteNames[highlighted]);
        } else {
          selectCard(searchResults[highlighted]);
        }
      } else {
        // No highlighted item — run full search
        if (autocompleteDebounce.current) clearTimeout(autocompleteDebounce.current);
        runCommanderSearch(query);
      }
    }
  };

  const handleSearchClick = () => {
    if (autocompleteDebounce.current) clearTimeout(autocompleteDebounce.current);
    runCommanderSearch(query);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(-1);
              // Reset to autocomplete mode on new input
              if (mode === "results") {
                setMode("autocomplete");
                setSearchResults([]);
              }
            }}
            onFocus={() => {
              if (currentList.length > 0) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSearchClick}
          disabled={loading || query.trim().length < 2}
          className="btn-primary px-5 py-2.5 flex-shrink-0"
        >
          Search
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Autocomplete mode — fast name list */}
          {mode === "autocomplete" && autocompleteNames.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                Suggestions — press Search for full results
              </div>
              {autocompleteNames.map((name, i) => (
                <button
                  key={name}
                  onClick={() => selectByName(name)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    i === highlighted ? "bg-gray-700" : "hover:bg-gray-800"
                  }`}
                >
                  <span className="text-gray-400 text-xs w-4 flex-shrink-0">{i + 1}</span>
                  <span className="text-white text-sm flex-1 truncate">{name}</span>
                  {i === highlighted && (
                    <span className="text-gray-500 text-xs flex-shrink-0">↵</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Results mode — rich card list with images */}
          {mode === "results" && searchResults.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              <div className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 sticky top-0 bg-gray-900">
                {searchResults.length} commander{searchResults.length !== 1 ? "s" : ""} found
              </div>
              {searchResults.map((card, i) => (
                <button
                  key={card.id}
                  onClick={() => selectCard(card)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === highlighted ? "bg-gray-700" : "hover:bg-gray-800"
                  }`}
                >
                  <CardImage
                    card={card}
                    size="small"
                    width={36}
                    height={50}
                    className="rounded flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-medium text-sm truncate">{card.name}</div>
                    <div className="text-gray-400 text-xs truncate">{card.type_line}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {card.color_identity.map((c) => (
                        <span key={c} className="text-xs">{colorSymbol(c)}</span>
                      ))}
                      {card.prices?.usd && (
                        <span className="text-yellow-500 text-xs ml-1">${card.prices.usd}</span>
                      )}
                    </div>
                  </div>
                  {i === highlighted && (
                    <span className="text-gray-500 text-xs flex-shrink-0">↵</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function colorSymbol(c: string): string {
  return { W: "☀️", U: "💧", B: "💀", R: "🔥", G: "🌲", C: "💎" }[c] ?? c;
}
