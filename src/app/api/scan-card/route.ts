import { NextRequest, NextResponse } from "next/server";
import Tesseract from "tesseract.js";
import { ScryfallCard } from "@/types/mtg";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json() as { image?: string };
  if (!body.image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const base64 = body.image.includes(",") ? body.image.split(",")[1] : body.image;
  const imageBuffer = Buffer.from(base64, "base64");

  // OCR the name strip
  let rawName = "";
  try {
    const worker = await Tesseract.createWorker("eng", 1, {
      cachePath: "/tmp",
      logger: () => {},
    });
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "7" as never,  // SINGLE_LINE
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',-./!",
      });
      const { data } = await worker.recognize(imageBuffer);
      rawName = data.text.trim().split("\n")[0].trim();
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.error("[scan-card] Tesseract error:", err);
    return NextResponse.json({ error: "OCR engine failed" }, { status: 500 });
  }

  if (!rawName || rawName.length < 2) {
    return NextResponse.json({ error: "No text detected — try better lighting or hold the card flatter" });
  }

  // Fuzzy Scryfall lookup
  const scryfallRes = await fetch(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(rawName)}`,
    { headers: { "User-Agent": "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)" } }
  );

  if (scryfallRes.ok) {
    const card = await scryfallRes.json() as ScryfallCard;
    return NextResponse.json({ card, rawName });
  }

  // Exact match failed — try autocomplete for candidates
  const autoRes = await fetch(
    `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(rawName)}&include_extras=false`,
    { headers: { "User-Agent": "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)" } }
  );
  const candidates: string[] = autoRes.ok
    ? ((await autoRes.json()) as { data: string[] }).data.slice(0, 5)
    : [];

  return NextResponse.json({ error: "Card not found", rawName, candidates });
}
