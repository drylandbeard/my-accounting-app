import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Force Node.js runtime for middleware
export const runtime = 'nodejs';

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
    "/api/accountant/accept-invite",
    "/api/accountant/complete-invite",
    "/verify-email",
    "/accept-invitation",
    "/accountant/accept-invite"
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
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-company-id, x-user-id");
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

  // For protected routes, we'll let the API routes handle authentication
  // since middleware can't reliably verify JWT tokens in Edge runtime

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