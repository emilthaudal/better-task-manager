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

export interface SessionData {
  /** OAuth Bearer access token */
  accessToken?: string;
  /** OAuth rotating refresh token */
  refreshToken?: string;
  /** Unix timestamp (ms) when accessToken expires */
  expiresAt?: number;
  /** Atlassian Cloud ID for the selected Jira site */
  cloudId?: string;
  /** Accessible Jira sites returned from /oauth/token/accessible-resources */
  sites?: AtlassianSite[];
  /** Authenticated user identity */
  user?: AtlassianUser;
  /** CSRF state nonce for the OAuth flow */
  oauthState?: string;
}

const SESSION_PASSWORD =
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

/** Returns true if the session has a valid, non-expired access token and a selected cloudId. */
export function isAuthenticated(session: SessionData): boolean {
  return (
    !!session.accessToken &&
    !!session.cloudId &&
    !!session.expiresAt &&
    session.expiresAt > Date.now()
  );
}
