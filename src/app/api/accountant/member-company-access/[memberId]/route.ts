import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    // Get user ID from JWT token
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user is an Accountant
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("id", userId)
      .eq("role", "Accountant")
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Only Accountants can view team member company access" },
        { status: 403 }
      );
    }

    const { memberId } = params;

    // Validate input
    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Verify that the member is part of this accountant's team
    const { data: teamMember, error: teamMemberError } = await supabase
      .from("accountant_members_list")
      .select("id, user_id, name, email")
      .eq("accountant_id", userId)
      .eq("id", memberId)
      .eq("is_active", true)
      .single();

    if (teamMemberError || !teamMember) {
      return NextResponse.json(
        { error: "Team member not found or not part of your team" },
        { status: 404 }
      );
    }

    if (!teamMember.user_id) {
      return NextResponse.json({
        teamMember: {
          id: teamMember.id,
          name: teamMember.name,
          email: teamMember.email,
          hasUserAccount: false
        },
        grantedCompanies: [],
        availableCompanies: []
      });
    }

    // Get companies that this team member has been granted access to
    const { data: grantedCompanies, error: grantedError } = await supabase
      .from("accountant_company_access")
      .select(`
        id,
        company_id,
        is_active,
        created_at,
        companies (
          id,
          name,
          description
        )
      `)
      .eq("accountant_id", userId)
      .eq("member_user_id", teamMember.user_id)
      .eq("is_active", true);

    if (grantedError) {
      console.error("Error fetching granted companies:", grantedError);
      return NextResponse.json(
        { error: "Failed to fetch granted companies" },
        { status: 500 }
      );
    }

    // Get companies that the accountant has access to (for granting)
    const { data: accountantCompanies, error: accountantCompaniesError } = await supabase
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

    if (accountantCompaniesError) {
      console.error("Error fetching accountant companies:", accountantCompaniesError);
      return NextResponse.json(
        { error: "Failed to fetch available companies" },
        { status: 500 }
      );
    }

    // Transform the data
    const transformedGrantedCompanies = grantedCompanies?.map(item => ({
      accessGrantId: item.id,
      company: Array.isArray(item.companies) ? item.companies[0] : item.companies,
      grantedAt: item.created_at
    })) || [];

    const transformedAvailableCompanies = accountantCompanies?.map(item => ({
      company: Array.isArray(item.companies) ? item.companies[0] : item.companies,
      accountantRole: item.role,
      hasAccess: grantedCompanies?.some(granted => granted.company_id === item.company_id) || false
    })) || [];

    return NextResponse.json({
      teamMember: {
        id: teamMember.id,
        name: teamMember.name,
        email: teamMember.email,
        hasUserAccount: true
      },
      grantedCompanies: transformedGrantedCompanies,
      availableCompanies: transformedAvailableCompanies
    });

  } catch (error) {
    console.error("Error in accountant member-company-access endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 