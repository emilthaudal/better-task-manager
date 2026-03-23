import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import type { SessionData } from "@/lib/session";

const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "dev-only-secret-replace-in-production-32ch";
const COOKIE_NAME = "btm_session";

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/contact",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
  "/api/auth/sites",
  "/api/auth/select-site",
  "/api/auth/refresh",
  "/api/auth/me",
  "/select-site",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;

  if (cookieValue) {
    try {
      const session = await unsealData<SessionData>(cookieValue, {
        password: SESSION_SECRET,
      });

      // Has a valid token and selected site
      if (
        session.accessToken &&
        session.cloudId &&
        session.expiresAt &&
        session.expiresAt > Date.now()
      ) {
        return NextResponse.next();
      }

      // Has tokens but no site selected yet — redirect to picker
      if (session.accessToken && !session.cloudId) {
        const url = req.nextUrl.clone();
        url.pathname = "/select-site";
        return NextResponse.redirect(url);
      }
    } catch {
      // Invalid/tampered cookie — fall through to redirect
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
