import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/jwt";
import { verifyRefreshToken } from "@/lib/jwt";
import { supabase } from "@/lib/supabase";
import { UserCompany } from "@/zustand/authStore";

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

    // Fetch user's companies (both direct access and accountant-granted access)
    const { data: directCompanies, error: directCompaniesError } = await supabase
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

    if (directCompaniesError) {
      console.error("Error fetching user direct companies:", directCompaniesError);
      return NextResponse.json(
        { error: "Failed to fetch user companies" },
        { status: 500 }
      );
    }

    // Get accountant-granted company access
    const { data: grantedCompanies, error: grantedCompaniesError } = await supabase
      .from("accountant_company_access")
      .select(`
        company_id,
        accountant_id,
        companies (
          id,
          name,
          description
        )
      `)
      .eq("member_user_id", userId)
      .eq("is_active", true);

    if (grantedCompaniesError) {
      console.error("Error fetching user granted companies:", grantedCompaniesError);
      return NextResponse.json(
        { error: "Failed to fetch user companies" },
        { status: 500 }
      );
    }

    // Transform direct companies
    const transformedDirectCompanies = directCompanies?.map(item => ({
      company_id: item.company_id,
      role: item.role,
      companies: Array.isArray(item.companies) ? item.companies[0] : item.companies,
      access_type: "direct" as const
    })) || [];

    // Transform granted companies
    const transformedGrantedCompanies = grantedCompanies?.map(item => ({
      company_id: item.company_id,
      role: "Member" as const, // ATMs always have Member role for granted companies
      companies: Array.isArray(item.companies) ? item.companies[0] : item.companies,
      access_type: "granted" as const,
      granted_by_accountant: "Accountant" // We'll fetch the actual name in the UI layer
    })) || [];

    // Merge both types of access, avoiding duplicates
    const allCompanies: UserCompany[] = [...transformedDirectCompanies];
    transformedGrantedCompanies.forEach(grantedCompany => {
      const isDuplicate = allCompanies.some(directCompany => 
        directCompany.company_id === grantedCompany.company_id
      );
      if (!isDuplicate) {
        allCompanies.push(grantedCompany);
      }
    });

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      companies: allCompanies || [],
      currentCompany: null, // Don't automatically select first company
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 