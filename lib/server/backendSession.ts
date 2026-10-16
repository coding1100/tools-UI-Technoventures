import "server-only";

/**
 * The app has exactly one identity: the team account in the backend. It signs
 * in with credentials held in server env vars, so the browser never sees the
 * password or the access token. The token is cached per server instance and
 * renewed a minute before it expires, or immediately after a 401.
 */

type CachedToken = { accessToken: string; expiresAtMs: number };

const RENEW_BEFORE_EXPIRY_MS = 60_000;

let cached: CachedToken | null = null;
let pending: Promise<CachedToken> | null = null;

export function backendUrl(path: string): string {
  const base = process.env.BACKEND_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("BACKEND_API_URL is not set");
  return `${base}${path}`;
}

async function signIn(): Promise<CachedToken> {
  const email = process.env.TEAM_ACCOUNT_EMAIL;
  const password = process.env.TEAM_ACCOUNT_PASSWORD;
  if (!email || !password) {
    throw new Error("TEAM_ACCOUNT_EMAIL and TEAM_ACCOUNT_PASSWORD must be set");
  }
  const response = await fetch(backendUrl("/auth/signin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  const session = payload?.data ?? payload;
  if (!response.ok || typeof session?.access_token !== "string") {
    throw new Error(`Team account sign-in failed (${response.status})`);
  }
  const expiresAtMs = Number(session.expires_at) * 1000;
  return {
    accessToken: session.access_token,
    // Fall back to a conservative 30 minutes if the backend omits expiry.
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 30 * 60_000,
  };
}

export async function getAccessToken({ renew = false } = {}): Promise<string> {
  if (!renew && cached && cached.expiresAtMs - RENEW_BEFORE_EXPIRY_MS > Date.now()) {
    return cached.accessToken;
  }
  // One sign-in at a time; concurrent requests share it.
  pending ??= signIn()
    .then((token) => {
      cached = token;
      return token;
    })
    .finally(() => {
      pending = null;
    });
  return (await pending).accessToken;
}
