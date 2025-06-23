import { NextRequest, NextResponse } from "next/server";
import { verifyEmail, getUserCompanies } from "@/lib/auth";
import { generateTokens } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and verification code are required" },
        { status: 400 }
      );
    }

    // Use the existing verifyEmail function, but pass the code as the token parameter
    const result = await verifyEmail(code);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    if (result.success && result.user) {
      // Generate JWT tokens
      const { accessToken, refreshToken } = generateTokens({
        userId: result.user.id,
        email: result.user.email,
      });

      // Get user's companies
      const companiesResult = await getUserCompanies(result.user.id);
      const companies = companiesResult.companies || [];
      const currentCompany = companies.length > 0 ? companies[0].companies : null;

      // Create response
      const response = NextResponse.json({
        message: "Email verified successfully",
        user: result.user,
        companies,
        currentCompany,
        accessToken, // Only send access token in body
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

    return NextResponse.json({
      message: "Email verified successfully",
      user: result.user
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 