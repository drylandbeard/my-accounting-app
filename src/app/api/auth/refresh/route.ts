import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, generateTokens } from "@/lib/jwt";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from HTTP-only cookie
    const refreshToken = request.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token is required" },
        { status: 400 }
      );
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      // Clear invalid refresh token cookie
      const response = NextResponse.json(
        { error: "Invalid refresh token" },
        { status: 401 }
      );
      response.cookies.delete("refreshToken");
      return response;
    }

    // Get user to generate new tokens
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, role, is_access_enabled")
      .eq("id", payload.userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // Check if user access is still enabled
    if (!user.is_access_enabled) {
      return NextResponse.json(
        { error: "User access disabled" },
        { status: 401 }
      );
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      userId: user.id,
      email: user.email,
    });

    // Create response with access token only
    const response = NextResponse.json({
      accessToken,
      // Remove refreshToken from response body
    });

    // Set new refresh token as HTTP-only cookie
    response.cookies.set({
      name: "refreshToken",
      value: newRefreshToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 