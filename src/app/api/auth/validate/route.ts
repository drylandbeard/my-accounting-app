import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/jwt";
import { verifyRefreshToken } from "@/lib/jwt";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    // First try to get user ID from Authorization header (access token)
    let userId = getUserIdFromRequest(request);
    
    // If no access token, try to get user ID from refresh token cookie
    if (!userId) {
      const refreshToken = request.cookies.get('refreshToken')?.value;
      if (refreshToken) {
        const refreshPayload = verifyRefreshToken(refreshToken);
        userId = refreshPayload?.userId || null;
      }
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid or missing token" },
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

    // Fetch user's companies
    const { data: companies, error: companiesError } = await supabase
      .from("company_users")
      .select(`
        company_id,
        role,
        companies (
          id,
          name,
          description
        )
      `)
      .eq("user_id", userId)
      .eq("is_active", true);

    if (companiesError) {
      console.error("Error fetching user companies:", companiesError);
      return NextResponse.json(
        { error: "Failed to fetch user companies" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      companies: companies || [],
      currentCompany: null, // Don't automatically select first company
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 