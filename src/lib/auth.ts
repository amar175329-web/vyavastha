import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "vyavastha_session";
const SESSION_EXPIRY_DAYS = 30;

/**
 * Validates master password against APP_MASTER_PASSWORD from process.env.
 */
export function validateMasterPassword(password: string): boolean {
  const master = process.env.APP_MASTER_PASSWORD;
  if (!master) {
    return false;
  }
  // Constant-time comparison simulation to prevent timing attacks
  if (password.length !== master.length) {
    return false;
  }
  let match = 0;
  for (let i = 0; i < password.length; i++) {
    match |= password.charCodeAt(i) ^ master.charCodeAt(i);
  }
  return match === 0;
}

/**
 * Creates an HMAC signature for a timestamped session token.
 */
async function generateSignature(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates a signed session token.
 */
export async function createSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET || "fallback_session_secret_min16chars";
  const timestamp = Date.now().toString();
  const payload = `vyavastha_user:${timestamp}`;
  const sig = await generateSignature(payload, secret);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/**
 * Verifies a signed session token.
 */
export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payloadB64, signature] = parts;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const secret = process.env.SESSION_SECRET || "fallback_session_secret_min16chars";
    const expectedSig = await generateSignature(payload, secret);

    if (signature !== expectedSig) return false;

    // Check expiration (30 days)
    const [user, tsStr] = payload.split(":");
    if (user !== "vyavastha_user") return false;
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts)) return false;
    const maxAgeMs = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - ts > maxAgeMs) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Check session validity server-side using Next.js cookies().
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  return verifySessionToken(sessionCookie?.value);
}
