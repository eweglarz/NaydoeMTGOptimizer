"use client";

import { useState } from "react";
import { ScryfallCard } from "@/types/mtg";

interface ImportResult {
  commanders: ScryfallCard[];
  cards: ScryfallCard[];
}

interface Props {
  onImport: (result: ImportResult) => void;
}

export default function DeckImport({ onImport }: Props) {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const body = mode === "url" ? { url: input.trim() } : { text: input.trim() };
      const res = await fetch("/api/moxfield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as ImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      onImport(data);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-panel space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-200">Import Deck</h2>
        <div className="flex bg-gray-800 rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setMode("url")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${mode === "url" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Moxfield URL
          </button>
          <button
            onClick={() => setMode("text")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${mode === "text" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Paste List
          </button>
        </div>
      </div>

      {mode === "url" ? (
        <input
          type="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://www.moxfield.com/decks/..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
        />
      ) : (
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`1 Sol Ring\n1 Command Tower\n...\n\n1 Commander Name\n\n(Separate your commander with a blank line — at the top or bottom — or use "Commander:" syntax)`}
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors font-mono resize-none"
        />
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleImport}
        disabled={loading || !input.trim()}
        className="btn-primary w-full"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            Importing...
          </span>
        ) : mode === "url" ? "Import from Moxfield" : "Import Deck List"}
      </button>
    </div>
  );
}
