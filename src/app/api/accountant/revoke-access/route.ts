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
        { error: "Only Accountants can revoke team member access" },
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

    // Verify that the member is actually part of this accountant's team
    const { data: existingMember, error: memberError } = await supabase
      .from("accountant_members_list")
      .select("id")
      .eq("accountant_id", userId)
      .eq("id", memberId)
      .eq("is_active", true)
      .single();

    if (memberError || !existingMember) {
      return NextResponse.json(
        { error: "Team member not found or not part of your team" },
        { status: 404 }
      );
    }

    // Deactivate the team member relationship
    const { error: revokeError } = await supabase
      .from("accountant_members_list")
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingMember.id);

    if (revokeError) {
      console.error("Error revoking team member access:", revokeError);
      return NextResponse.json(
        { error: "Failed to revoke team member access" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Team member access revoked successfully"
    });

  } catch (error) {
    console.error("Error in accountant revoke-access endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
