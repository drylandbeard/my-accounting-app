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

    // Fetch user's companies
    const { data: companies, error: companiesError } = await supabase
      .from("user_companies")
      .select(`
        company_id,
        role,
        companies:company_id (
          id,
          name,
          description
        )
      `)
      .eq("user_id", userId);

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
      currentCompany: companies && companies.length > 0 ? companies[0].companies : null,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 