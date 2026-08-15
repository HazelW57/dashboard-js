import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "jiant_dashboard_session";
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

type AuthBindings = {
  APP_LOGIN_USERNAME?: string;
  APP_LOGIN_PASSWORD?: string;
  SESSION_SECRET?: string;
};

export type AppSessionUser = {
  username: string;
  displayName: string;
};

export function getAuthConfig() {
  const bindings = env as unknown as AuthBindings;
  const username = bindings.APP_LOGIN_USERNAME || process.env.APP_LOGIN_USERNAME;
  const password = bindings.APP_LOGIN_PASSWORD || process.env.APP_LOGIN_PASSWORD;
  const secret = bindings.SESSION_SECRET || process.env.SESSION_SECRET;
  if (!username || !password || !secret) return null;
  return { username, password, secret };
}

async function hmac(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(left: string, right: string) {
  const size = Math.max(left.length, right.length);
  let result = left.length ^ right.length;
  for (let index = 0; index < size; index += 1) {
    result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return result === 0;
}

export async function createSessionToken(username: string, secret: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${username}.${expires}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<AppSessionUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expiresText, signature] = parts;
  const expires = Number(expiresText);
  if (!username || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  const expected = await hmac(`${username}.${expiresText}`, secret);
  if (!safeEqual(signature, expected)) return null;
  return { username, displayName: username.toUpperCase() };
}

export async function getAppSession() {
  const config = getAuthConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token, config.secret);
  if (!session || !safeEqual(session.username, config.username)) return null;
  return session;
}

export async function requireAppSession(returnTo: string) {
  const session = await getAppSession();
  if (session) return session;
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  redirect(`/login?return_to=${encodeURIComponent(safeReturnTo)}`);
}

export const sessionCookieMaxAge = SESSION_DURATION_SECONDS;
