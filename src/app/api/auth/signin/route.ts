import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { generateTokens } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const result = await signIn(email, password);

    if (result.error) {
      return NextResponse.json(
        { error: result.error, needsVerification: result.needsVerification, email: result.email },
        { status: 400 }
      );
    }

    if (result.user && result.companies) {
      // Generate JWT tokens
      const { accessToken, refreshToken } = generateTokens({
        userId: result.user.id,
        email: result.user.email,
      });

      // Select current company (first one by default)
      const currentCompany = result.companies.length > 0 
        ? result.companies[0].companies 
        : null;

      // Create response
      const response = NextResponse.json({
        user: result.user,
        companies: result.companies,
        currentCompany,
        accessToken, // Only send access token in body
        // Remove refreshToken from response body
      });

      // Set refresh token as HTTP-only cookie
      response.cookies.set({
        name: "refreshToken",
        value: refreshToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      });

      return response;
    }

    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 