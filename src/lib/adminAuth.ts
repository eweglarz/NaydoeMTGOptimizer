import { NextRequest, NextResponse } from "next/server";

export function requireAdminKey(request: NextRequest): NextResponse | null {
  const key = request.headers.get("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
