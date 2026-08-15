import { NextResponse } from "next/server";
import {
  createSessionToken,
  getAuthConfig,
  safeEqual,
  SESSION_COOKIE,
  sessionCookieMaxAge,
} from "../../../lib/app-auth";
import { getBindings, initializeStorage } from "../../../lib/server-storage";

type AttemptRow = { attempts: number; locked_until: number };

export async function POST(request: Request) {
  const config = getAuthConfig();
  if (!config) {
    return NextResponse.json({ error: "Login is not configured" }, { status: 503 });
  }
  const body = await request.json() as { username?: string; password?: string };
  const identifier = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 120);
  const { DB } = getBindings();
  await initializeStorage(DB);
  const attempt = await DB.prepare(
    "SELECT attempts, locked_until FROM login_attempts WHERE identifier = ?",
  ).bind(identifier).first<AttemptRow>();
  const now = Date.now();
  if (attempt && attempt.locked_until > now) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const submittedUsername = body.username?.trim().toLowerCase() ?? "";
  const submittedPassword = body.password ?? "";
  let matchedAccount = null as typeof config.accounts[number] | null;
  for (const account of config.accounts) {
    const usernameMatches = safeEqual(submittedUsername, account.username.trim().toLowerCase());
    const passwordMatches = safeEqual(submittedPassword, account.password);
    if (usernameMatches && passwordMatches) matchedAccount = account;
  }
  if (!matchedAccount) {
    const attempts = (attempt?.attempts ?? 0) + 1;
    const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0;
    await DB.prepare(`INSERT INTO login_attempts (identifier, attempts, locked_until, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(identifier) DO UPDATE SET
        attempts = excluded.attempts,
        locked_until = excluded.locked_until,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(identifier, attempts >= 5 ? 0 : attempts, lockedUntil)
      .run();
    return NextResponse.json({ error: "Incorrect username or password" }, { status: 401 });
  }

  await DB.prepare("DELETE FROM login_attempts WHERE identifier = ?").bind(identifier).run();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(matchedAccount.role, config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionCookieMaxAge,
  });
  return response;
}
