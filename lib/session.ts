import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

export interface AtlassianSite {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
}

export interface AtlassianUser {
  account_id: string;
  email: string;
  name: string;
  picture: string;
}

/**
 * What is stored in the session cookie.
 *
 * Intentionally minimal — the access token is a large JWT (~1 KB) that
 * pushes the sealed cookie over the browser's 4096-byte hard limit.
 * Instead we store only the refresh token and cloudId here, and obtain
 * access tokens on demand via getAccessToken().
 *
 * Fields kept for legacy / migration compatibility are marked optional.
 */
export interface SessionData {
  /** OAuth rotating refresh token — used to obtain fresh access tokens */
  refreshToken?: string;
  /** Atlassian Cloud ID for the selected Jira site */
  cloudId?: string;
  /**
   * @deprecated Removed from cookie storage — too large.
   * Use getAccessToken(session.refreshToken) instead.
   */
  accessToken?: string;
  /**
   * @deprecated Removed from cookie storage.
   * Expiry is managed inside the access-token cache.
   */
  expiresAt?: number;
  /** CSRF state nonce for the OAuth flow (transient, not persisted) */
  oauthState?: string;
  /** Accessible Jira sites (legacy, not stored in cookie) */
  sites?: AtlassianSite[];
  /** Authenticated user identity (legacy, not stored in cookie) */
  user?: AtlassianUser;
}

export const SESSION_PASSWORD =
  process.env.SESSION_SECRET ?? "dev-only-secret-replace-in-production-32ch";

export const sessionOptions: SessionOptions = {
  cookieName: "btm_session",
  password: SESSION_PASSWORD,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Get the iron-session from a Next.js App Router request/response pair.
 * Use in API route handlers.
 */
export async function getSession(req: NextRequest, res: NextResponse) {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET env var is required in production");
  }
  return getIronSession<SessionData>(req, res, sessionOptions);
}

/**
 * Get the iron-session from Next.js Server Components / Server Actions
 * via the `cookies()` helper.
 */
export async function getServerSession() {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET env var is required in production");
  }
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** Returns true if the session has a valid refresh token and a selected cloudId. */
export function isAuthenticated(session: SessionData): boolean {
  return !!session.refreshToken && !!session.cloudId;
}

// ---------------------------------------------------------------------------
// Access token cache
//
// Access tokens are valid for 1 hour. We cache them in memory keyed by a
// hash of the refresh token so we don't call Atlassian on every request.
// On Vercel each serverless function instance is warm for several minutes,
// so the cache is effective in practice.
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  /** Unix ms when this cached entry expires */
  expiresAt: number;
  /** Updated refresh token (Atlassian rotates these) */
  refreshToken: string;
}

// Module-level cache — shared across requests within the same lambda instance.
const tokenCache = new Map<string, CachedToken>();

/** Simple non-cryptographic hash for use as a cache key. */
function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

const ATLASSIAN_CLIENT_ID =
  typeof process !== "undefined" ? process.env.ATLASSIAN_CLIENT_ID ?? "" : "";
const ATLASSIAN_CLIENT_SECRET =
  typeof process !== "undefined"
    ? process.env.ATLASSIAN_CLIENT_SECRET ?? ""
    : "";

/**
 * Returns a valid access token for the given refresh token.
 * Uses an in-memory cache; refreshes via Atlassian when the cached token
 * is missing or within 60 seconds of expiry.
 *
 * Also returns the (possibly rotated) refresh token so callers can persist
 * it back to the session cookie if it changed.
 */
export async function getAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const key = hashKey(refreshToken);
  const cached = tokenCache.get(key);
  const nowMs = Date.now();

  // Return cached token if it has more than 60 s of life remaining
  if (cached && cached.expiresAt - nowMs > 60_000) {
    return {
      accessToken: cached.accessToken,
      refreshToken: cached.refreshToken,
    };
  }

  // Refresh via Atlassian
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const newRefreshToken = data.refresh_token ?? refreshToken;
  const expiresAt = nowMs + data.expires_in * 1_000;

  // Evict old entry keyed by the previous refresh token
  tokenCache.delete(key);

  // Cache under the new refresh token key
  const newKey = hashKey(newRefreshToken);
  tokenCache.set(newKey, {
    accessToken: data.access_token,
    refreshToken: newRefreshToken,
    expiresAt,
  });

  return { accessToken: data.access_token, refreshToken: newRefreshToken };
}
