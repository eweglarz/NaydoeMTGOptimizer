"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScryfallCard } from "@/types/mtg";
import { getCardPrice } from "@/lib/scryfall";
import CardTooltip from "./CardTooltip";

interface Props {
  onAdd: (card: ScryfallCard) => void;
}

export default function CardSearch({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(q)}&mode=autocomplete`);
    const data = await res.json() as { data: string[] };
    setSuggestions(data.data ?? []);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 200);
  }, [query, fetchSuggestions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSuggestions([]);
    setOpen(true);
    try {
      const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(query)}&mode=cards`);
      const data = await res.json() as { data: ScryfallCard[] };
      setResults(data.data?.slice(0, 20) ?? []);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = async (name: string) => {
    setQuery(name);
    setSuggestions([]);
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/scryfall/card?name=${encodeURIComponent(name)}`);
      const card = await res.json() as ScryfallCard;
      if (card.id) setResults([card]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search and add cards..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
        />
        <button type="submit" className="btn-secondary text-sm px-3 py-2">
          Search
        </button>
      </form>

      {open && (suggestions.length > 0 || (results.length > 0 && !loading)) && (
        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
          {suggestions.length > 0 && (
            <div className="p-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {suggestions.length === 0 && results.map((card) => {
            const price = getCardPrice(card);
            return (
              <CardTooltip key={card.id} card={card}>
                <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-800 transition-colors cursor-pointer group">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{card.name}</div>
                    <div className="text-gray-400 text-xs truncate">{card.type_line}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {price !== null && (
                      <span className="text-yellow-500 text-xs">${price.toFixed(2)}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd(card); }}
                      className="text-xs bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold px-2 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </CardTooltip>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="absolute right-14 top-2.5">
          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
