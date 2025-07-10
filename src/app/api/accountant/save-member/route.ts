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
        { error: "Only Accountants can save team member details" },
        { status: 403 }
      );
    }

    // Parse request body
    const { memberId, memberUserId, firstName, lastName, email, companyAccess } = await request.json();

    // Validate input
    if (!memberId || !memberUserId || !firstName || !lastName || !email || !Array.isArray(companyAccess)) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Verify that the member is part of this accountant's team
    const { data: teamMember, error: teamMemberError } = await supabase
      .from("accountant_members_list")
      .select("id, user_id")
      .eq("accountant_id", userId)
      .eq("id", memberId)
      .eq("user_id", memberUserId)
      .eq("is_active", true)
      .single();

    if (teamMemberError || !teamMember) {
      return NextResponse.json(
        { error: "Team member not found or not part of your team" },
        { status: 404 }
      );
    }

    // Update team member details
    const { error: updateMemberError } = await supabase
      .from("accountant_members_list")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", memberId);

    if (updateMemberError) {
      console.error("Error updating team member:", updateMemberError);
      return NextResponse.json(
        { error: "Failed to update team member details" },
        { status: 500 }
      );
    }

    // Update user details if different from team member record
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", memberUserId);

    if (updateUserError) {
      console.error("Error updating user details:", updateUserError);
      // Don't fail the operation if user update fails
    }

    // Process company access changes
    for (const access of companyAccess) {
      const { companyId, hasAccess } = access;

      // Verify that the accountant has access to this company
      const { data: accountantAccess, error: accountantAccessError } = await supabase
        .from("company_users")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (accountantAccessError || !accountantAccess) {
        console.warn(`Accountant doesn't have access to company ${companyId}, skipping...`);
        continue;
      }

      // Get existing access grant
      const { data: existingGrant } = await supabase
        .from("accountant_company_access")
        .select("id, is_active")
        .eq("accountant_id", userId)
        .eq("member_user_id", memberUserId)
        .eq("company_id", companyId)
        .single();

      if (hasAccess) {
        // Grant access
        if (existingGrant) {
          if (!existingGrant.is_active) {
            // Reactivate existing grant
            await supabase
              .from("accountant_company_access")
              .update({ 
                is_active: true,
                updated_at: new Date().toISOString()
              })
              .eq("id", existingGrant.id);
          }
          // If already active, no action needed
        } else {
          // Create new grant
          await supabase
            .from("accountant_company_access")
            .insert({
              accountant_id: userId,
              member_user_id: memberUserId,
              company_id: companyId,
              is_active: true
            });
        }
      } else {
        // Revoke access
        if (existingGrant && existingGrant.is_active) {
          await supabase
            .from("accountant_company_access")
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingGrant.id);
        }
        // If no grant exists or already inactive, no action needed
      }
    }

    return NextResponse.json({
      success: true,
      message: "Team member saved successfully"
    });

  } catch (error) {
    console.error("Error in accountant save-member endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 