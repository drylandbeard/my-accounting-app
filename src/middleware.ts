import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/jwt";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public routes that don't require authentication
  const publicRoutes = [
    "/api/auth/signup",
    "/api/auth/signin", 
    "/api/auth/verify-email",
    "/api/auth/verify-code",
    "/api/auth/resend-verification",
    "/api/accept-invitation",
    "/api/member/accept-invitation",
    "/api/member/complete-invitation",
    "/verify-email",
    "/accept-invitation"
  ];

  // Define routes that are always public (static assets, etc.)
  const alwaysPublicRoutes = [
    "/_next",
    "/favicon.ico",
    "/api/auth/logout", // Allow logout without auth check
    "/api/auth/refresh", // Allow refresh without access token check
    "/api/auth/validate" // Allow validation endpoint
  ];

  // Check if the route is always public (static assets, etc.)
  const isAlwaysPublic = alwaysPublicRoutes.some(route => pathname.startsWith(route));
  
  // Check if the route is in our public routes list
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Clone the request headers
  const headers = new Headers(request.headers);

  // Add security headers
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Configure CORS for cookie-based auth
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    ...(process.env.NODE_ENV === "development" ? [
      "http://localhost:3000",
    ] : []),
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.use-switch.com"
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Company-Id, X-User-Id");
  }

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  // Skip auth check for always public routes and public routes
  if (isAlwaysPublic || isPublicRoute) {
    return NextResponse.next({
      request: {
        headers,
      },
    });
  }

  // For protected routes, verify authentication
  if (pathname.startsWith("/api/") || pathname === "/" || !isPublicRoute) {
    // Skip auth check for homepage (handled by AuthenticatedApp)
    if (pathname === "/") {
      return NextResponse.next({
        request: {
          headers,
        },
      });
    }

    // Check for access token in Authorization header
    const authHeader = request.headers.get("authorization");
    let isAuthenticated = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      if (payload) {
        isAuthenticated = true;
        // Add user info to headers for API routes
        headers.set("X-User-Id", payload.userId);
      }
    }

    // If no valid access token, check for refresh token in cookies
    if (!isAuthenticated) {
      const refreshToken = request.cookies.get("refreshToken")?.value;
      if (refreshToken) {
        const payload = verifyRefreshToken(refreshToken);
        if (payload) {
          // We have a valid refresh token, let the request proceed
          // The client will handle token refresh
          isAuthenticated = true;
          headers.set("X-User-Id", payload.userId);
        }
      }
    }

    // For API routes (except auth routes), require authentication
    if (pathname.startsWith("/api/") && !isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers }
      );
    }
  }

  // Create response with new headers
  return NextResponse.next({
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: [
    // Match all API routes
    "/api/:path*",
    // Exclude static files and images, but include all pages
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}; 