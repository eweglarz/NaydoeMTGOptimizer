import { NextRequest, NextResponse } from "next/server";
import { getCardByNameSafe as getCardByName } from "@/lib/scryfallServer";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const card = await getCardByName(name);
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    return NextResponse.json(card);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
