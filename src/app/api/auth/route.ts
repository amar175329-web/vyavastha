import { NextRequest, NextResponse } from "next/server";
import {
  validateMasterPassword,
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Session verification endpoint.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await verifySessionToken(token);
  return NextResponse.json({ authenticated });
}

/**
 * Master password login endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { ok: false, error: "Master password is required" },
        { status: 400 }
      );
    }

    const isValid = validateMasterPassword(password);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Incorrect master password" },
        { status: 401 }
      );
    }

    const token = await createSessionToken();
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Authentication request malformed" },
      { status: 400 }
    );
  }
}

/**
 * Logout endpoint. Clears session cookie.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
