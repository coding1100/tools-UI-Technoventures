/**
 * Sign-in uses the team account's own credentials (TEAM_ACCOUNT_EMAIL /
 * TEAM_ACCOUNT_PASSWORD), so there is nothing extra to configure. The session
 * is a cookie holding an expiry time, signed with a key derived from that
 * password: nothing is stored server-side, and changing the password signs
 * everyone out. Uses Web Crypto so it runs in middleware too.
 */

export const SESSION_COOKIE = "team_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function credentials() {
  const email = process.env.TEAM_ACCOUNT_EMAIL;
  const password = process.env.TEAM_ACCOUNT_PASSWORD;
  if (!email || !password) throw new Error("TEAM_ACCOUNT_EMAIL and TEAM_ACCOUNT_PASSWORD must be set");
  return { email, password };
}

async function hmac(message: string): Promise<string> {
  const keyMaterial = encoder.encode(`team-session:${credentials().password}`);
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that does not depend on where they differ. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([hmac(`cmp:${a}`), hmac(`cmp:${b}`)]);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function checkCredentials(email: string, password: string): Promise<boolean> {
  const expected = credentials();
  // Both compared every time, so the response time does not reveal which one was wrong.
  const [emailOk, passwordOk] = await Promise.all([
    safeEqual(email.toLowerCase(), expected.email.toLowerCase()),
    safeEqual(password, expected.password),
  ]);
  return emailOk && passwordOk;
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  return `${expiresAt}.${await hmac(`session:${expiresAt}`)}`;
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) * 1000 <= Date.now()) return false;
  return safeEqual(signature, await hmac(`session:${expiresAt}`));
}
