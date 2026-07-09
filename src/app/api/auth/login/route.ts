import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/appDb";
import { signToken, withSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json() as { email: string; password: string };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = getUserByEmail(email.toLowerCase().trim());
  const valid = user && await bcrypt.compare(password, user.password_hash);

  // Same error for not-found and wrong password (prevents user enumeration)
  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await signToken({ sub: user.id, email: user.email, displayName: user.display_name });
  return withSession(
    NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.display_name } }),
    token
  );
}
