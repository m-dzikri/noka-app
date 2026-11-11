import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema/auth";
import { hashToken } from "@/features/auth/password";
import { ApiError } from "@/lib/api-response";
import { getEnv } from "@/lib/env";
import { LOCALE_COOKIE_NAME, THEME_COOKIE_NAME } from "@/lib/i18n/server";
import type { Locale, Theme } from "@/lib/i18n/types";

export const SESSION_COOKIE_NAME = "noka_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const PREFERENCE_COOKIE_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  locale: Locale;
  theme: Theme;
  cycleStartDay: string;
}

export interface AuthSessionContext {
  user: AuthUser;
  sessionId: string;
}

function isPlausibleTokenFormat(token: string | undefined): token is string {
  return Boolean(token && token.length >= 20 && token.length <= 128);
}

function isSecureCookieEnvironment(): boolean {
  return getEnv().APP_URL.startsWith("https://");
}

function normalizeLocale(value: string): Locale {
  return value === "en" ? "en" : "id";
}

function normalizeTheme(value: string): Theme {
  return value === "dark" ? "dark" : "light";
}

/**
 * Resolves the raw noka_session cookie from a NextRequest (Route Handler) or Next server cookies().
 */
export async function readSessionCookieToken(
  req?: NextRequest,
): Promise<string | undefined> {
  if (req) {
    return req.cookies.get(SESSION_COOKIE_NAME)?.value;
  }
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Resolves active user & session ID, short-circuiting without a DB query if cookie is missing/malformed.
 */
export async function getSessionContext(
  req?: NextRequest,
): Promise<AuthSessionContext | null> {
  const rawToken = await readSessionCookieToken(req);
  if (!isPlausibleTokenFormat(rawToken)) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const rows = await getDb()
    .select({
      sessionId: sessions.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      locale: users.locale,
      theme: users.theme,
      cycleStartDay: users.cycleStartDay,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      locale: normalizeLocale(row.locale),
      theme: normalizeTheme(row.theme),
      cycleStartDay: row.cycleStartDay,
    },
  };
}

/**
 * Returns the currently authenticated user DTO or null (never returns passwordHash).
 */
export async function getSessionUser(
  req?: NextRequest,
): Promise<AuthUser | null> {
  const ctx = await getSessionContext(req);
  return ctx?.user ?? null;
}

/**
 * Verifies an active session on protected API routes, throwing 401 UNAUTHORIZED when absent/expired.
 */
export async function requireAuth(
  req?: NextRequest,
): Promise<AuthSessionContext> {
  const ctx = await getSessionContext(req);
  if (!ctx) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }
  return ctx;
}

/**
 * Deletes a database session matching the presented raw session cookie token.
 */
export async function revokeSessionByRawToken(rawToken: string): Promise<void> {
  if (!isPlausibleTokenFormat(rawToken)) {
    return;
  }
  await getDb()
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(rawToken)));
}

/**
 * Attaches the HttpOnly noka_session cookie to a NextResponse (SEC-3).
 */
export function setSessionCookie(response: NextResponse, rawToken: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureCookieEnvironment(),
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Clears the noka_session cookie with matching security attributes.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureCookieEnvironment(),
    maxAge: 0,
  });
}

/**
 * Synchronizes non-HttpOnly noka_locale and noka_theme cookies alongside auth responses.
 */
export function setPreferenceCookies(
  response: NextResponse,
  locale: Locale,
  theme: Theme,
): void {
  const secure = isSecureCookieEnvironment();
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: PREFERENCE_COOKIE_TTL_SECONDS,
  });
  response.cookies.set(THEME_COOKIE_NAME, theme, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: PREFERENCE_COOKIE_TTL_SECONDS,
  });
}

