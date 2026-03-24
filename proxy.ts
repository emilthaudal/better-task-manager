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
  "/api/auth/set-session",
  "/api/auth/logout",
  "/api/auth/sites",
  "/api/auth/select-site",
  "/api/auth/refresh",
  "/api/auth/me",
  "/api/auth/debug",
  "/select-site",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static assets always
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Allow public paths — use exact match for "/" to avoid matching every path
  const isPublic = PUBLIC_PATHS.some((p) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p),
  );
  if (isPublic) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;

  if (cookieValue) {
    try {
      const session = await unsealData<SessionData>(cookieValue, {
        password: SESSION_SECRET,
      });

      // Has a valid refresh token and selected site — allow through
      if (session.refreshToken && session.cloudId) {
        return NextResponse.next();
      }

      // Has a refresh token but no site selected yet — redirect to picker
      if (session.refreshToken && !session.cloudId) {
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
