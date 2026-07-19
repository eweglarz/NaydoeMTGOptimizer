"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScryfallCard } from "@/types/mtg";
import CardImage from "./CardImage";

interface Props {
  onSelect: (card: ScryfallCard) => void;
  placeholder?: string;
  label?: string;
}

export default function CommanderSearch({
  onSelect,
  placeholder = "Search commanders...",
  label = "Choose Commander",
}: Props) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full commander search — filters to legendary creatures only
  const runCommanderSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/scryfall/search?q=${encodeURIComponent(q)}&mode=commander`
      );
      const data = (await res.json()) as { data: ScryfallCard[] };
      const cards = data.data ?? [];
      setSearchResults(cards);
      setOpen(cards.length > 0);
      setHighlighted(-1);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce live search on every keystroke (350ms for full search)
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setOpen(false);
      return;
    }
    searchDebounce.current = setTimeout(() => runCommanderSearch(query), 350);
  }, [query, runCommanderSearch]);

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

  const selectCard = useCallback(
    (card: ScryfallCard) => {
      setQuery(card.name);
      setOpen(false);
      setSearchResults([]);
      onSelect(card);
    },
    [onSelect]
  );

  const listLength = searchResults.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || listLength === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
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
        selectCard(searchResults[highlighted]);
      } else {
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        runCommanderSearch(query);
      }
    }
  };

  const handleSearchClick = () => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
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
            }}
            onFocus={() => {
              if (searchResults.length > 0) setOpen(true);
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

      {/* Dropdown — only shows legendary creatures */}
      {open && searchResults.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
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
                  <div className="flex items-center gap-1 mt-0.5">
                    {card.color_identity.length === 0 ? (
                      <i className="ms ms-cost ms-c" style={{ fontSize: "14px" }} aria-label="Colorless" />
                    ) : (
                      card.color_identity.map((c) => (
                        <i key={c} className={`ms ms-cost ms-${c.toLowerCase()}`} style={{ fontSize: "14px" }} aria-label={c} />
                      ))
                    )}
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
        </div>
      )}
    </div>
  );
}

