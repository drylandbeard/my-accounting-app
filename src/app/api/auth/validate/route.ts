import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/jwt";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Verify user still exists and has access
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, role, is_access_enabled")
      .eq("id", userId)
      .single();

    if (error || !user || !user.is_access_enabled) {
      return NextResponse.json(
        { error: "User not found or access disabled" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 