import { NextResponse } from "next/server";

export async function POST() {
  // Create response
  const response = NextResponse.json({
    message: "Logged out successfully"
  });

  // Clear refresh token cookie with the same attributes used when setting it
  response.cookies.set({
    name: "refreshToken",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0, // Expire immediately
    path: "/",
  });

  return response;
} 