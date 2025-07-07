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
        { error: "Only Accountants can remove team members" },
        { status: 403 }
      );
    }

    // Parse request body
    const { memberId } = await request.json();

    // Validate input
    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Get team member details
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

    // Deactivate team member record
    const { error: deactivateMemberError } = await supabase
      .from("accountant_members_list")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", memberId);

    if (deactivateMemberError) {
      console.error("Error deactivating team member:", deactivateMemberError);
      return NextResponse.json(
        { error: "Failed to remove team member" },
        { status: 500 }
      );
    }

    // If team member has a user account, revoke all company access grants
    if (teamMember.user_id) {
      const { error: revokeAccessError } = await supabase
        .from("accountant_company_access")
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq("accountant_id", userId)
        .eq("member_user_id", teamMember.user_id)
        .eq("is_active", true);

      if (revokeAccessError) {
        console.error("Error revoking company access:", revokeAccessError);
        // Don't fail the operation if access revocation fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Team member removed successfully"
    });

  } catch (error) {
    console.error("Error in accountant remove-member endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 