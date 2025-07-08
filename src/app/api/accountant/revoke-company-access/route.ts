import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function DELETE(request: NextRequest) {
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
        { error: "Only Accountants can revoke company access" },
        { status: 403 }
      );
    }

    // Parse request body
    const { memberUserId, companyId } = await request.json();

    // Validate input
    if (!memberUserId || !companyId) {
      return NextResponse.json(
        { error: "Member User ID and Company ID are required" },
        { status: 400 }
      );
    }

    // Verify that the member is part of this accountant's team
    const { data: teamMember, error: teamMemberError } = await supabase
      .from("accountant_members_list")
      .select("id, user_id")
      .eq("accountant_id", userId)
      .eq("user_id", memberUserId)
      .eq("is_active", true)
      .single();

    if (teamMemberError || !teamMember) {
      return NextResponse.json(
        { error: "Team member not found or not part of your team" },
        { status: 404 }
      );
    }

    // Verify that the accountant has access to this company
    const { data: accountantCompanyAccess, error: accountantAccessError } = await supabase
      .from("company_users")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (accountantAccessError || !accountantCompanyAccess) {
      return NextResponse.json(
        { error: "You don't have access to this company" },
        { status: 403 }
      );
    }

    // Find and revoke the access grant
    const { data: existingGrant, error: grantError } = await supabase
      .from("accountant_company_access")
      .select("id")
      .eq("accountant_id", userId)
      .eq("member_user_id", memberUserId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .single();

    if (grantError || !existingGrant) {
      return NextResponse.json(
        { error: "No active access grant found for this team member and company" },
        { status: 404 }
      );
    }

    // Revoke the access grant
    const { error: revokeError } = await supabase
      .from("accountant_company_access")
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingGrant.id);

    if (revokeError) {
      console.error("Error revoking company access grant:", revokeError);
      return NextResponse.json(
        { error: "Failed to revoke company access" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Company access revoked successfully"
    });

  } catch (error) {
    console.error("Error in accountant revoke-company-access endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 