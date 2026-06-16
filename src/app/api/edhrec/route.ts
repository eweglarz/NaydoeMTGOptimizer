import { NextRequest, NextResponse } from "next/server";
import { getCommanderRecommendations } from "@/lib/edhrec";

export async function GET(req: NextRequest) {
  const commander = req.nextUrl.searchParams.get("commander") ?? "";
  if (!commander) return NextResponse.json({ error: "commander required" }, { status: 400 });

  try {
    const data = await getCommanderRecommendations(commander);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
