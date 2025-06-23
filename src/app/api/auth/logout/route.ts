import { NextResponse } from "next/server";

export async function POST() {
  // Create response
  const response = NextResponse.json({
    message: "Logged out successfully"
  });

  // Clear refresh token cookie
  response.cookies.delete({
    name: "refreshToken",
    path: "/",
  });

  return response;
} 