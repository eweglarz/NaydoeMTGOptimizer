import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, createUser } from "@/lib/appDb";
import { signToken, withSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password, displayName } = await req.json() as {
    email: string; password: string; displayName: string;
  };

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: "Email, password, and display name are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (displayName.trim().length < 2) {
    return NextResponse.json({ error: "Display name must be at least 2 characters." }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  if (getUserByEmail(normalized)) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = createUser({
    id: crypto.randomUUID(),
    email: normalized,
    display_name: displayName.trim().slice(0, 50),
    password_hash: passwordHash,
  });

  const token = await signToken({ sub: user.id, email: user.email, displayName: user.display_name });
  return withSession(
    NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.display_name } }, { status: 201 }),
    token
  );
}
