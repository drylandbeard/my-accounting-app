import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
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
        { error: "Only Accountants can grant company access" },
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
      .eq("is_access_enabled", true)
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

    // Check if access grant already exists
    const { data: existingGrant } = await supabase
      .from("accountant_company_access")
      .select("id, is_active")
      .eq("accountant_id", userId)
      .eq("member_user_id", memberUserId)
      .eq("company_id", companyId)
      .single();

    if (existingGrant) {
      if (existingGrant.is_active) {
        return NextResponse.json(
          { error: "Access already granted to this team member for this company" },
          { status: 400 }
        );
      } else {
        // Reactivate existing grant
        const { error: reactivateError } = await supabase
          .from("accountant_company_access")
          .update({ 
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingGrant.id);

        if (reactivateError) {
          console.error("Error reactivating company access grant:", reactivateError);
          return NextResponse.json(
            { error: "Failed to grant company access" },
            { status: 500 }
          );
        }
      }
    } else {
      // Create new access grant
      const { error: grantError } = await supabase
        .from("accountant_company_access")
        .insert({
          accountant_id: userId,
          member_user_id: memberUserId,
          company_id: companyId,
          is_active: true
        });

      if (grantError) {
        console.error("Error creating company access grant:", grantError);
        return NextResponse.json(
          { error: "Failed to grant company access" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Company access granted successfully"
    });

  } catch (error) {
    console.error("Error in accountant grant-company-access endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 