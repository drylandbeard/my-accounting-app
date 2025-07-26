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

    // Parse request body
    const { memberId, role, is_access_enabled } = await request.json();
    console.log("📝 Update member request:", { memberId, role, is_access_enabled });

    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Get current user's company and role to verify permissions
    // Use the company ID from the request header to determine which company context we're in
    const companyIdFromHeader = request.headers.get("x-company-id");
    
    if (!companyIdFromHeader) {
      return NextResponse.json(
        { error: "Company context is required" },
        { status: 400 }
      );
    }

    const { data: currentUserCompany, error: userCompanyError } = await supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", userId)
      .eq("company_id", companyIdFromHeader)
      .eq("is_active", true)
      .single();

    if (userCompanyError || !currentUserCompany) {
      console.log("❌ Current user company not found:", userCompanyError);
      return NextResponse.json(
        { error: "User not found in this company or access denied" },
        { status: 404 }
      );
    }

    const { company_id: companyId, role: currentUserRole } = currentUserCompany;
    // Verify the company ID matches what we got from the header
    if (companyId !== companyIdFromHeader) {
      return NextResponse.json(
        { error: "Company context mismatch" },
        { status: 400 }
      );
    }

    // Get the member to be updated to verify they're in the same company
    const { data: memberToUpdate, error: memberError } = await supabase
      .from("company_users")
      .select("user_id, role, company_id")
      .eq("user_id", memberId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .single();

    if (memberError || !memberToUpdate) {
      console.log("❌ Member not found:", memberError);
      return NextResponse.json(
        { error: "Member not found in this company" },
        { status: 404 }
      );
    }

    // Check permissions - only owners can edit members, and non-owners can't create owners
    if (currentUserRole !== "Owner") {
      return NextResponse.json(
        { error: "Only company owners can edit member details" },
        { status: 403 }
      );
    }

    // Prevent removing the last owner
    if (memberToUpdate.role === "Owner" && role !== "Owner") {
      const { data: ownerCount, error: countError } = await supabase
        .from("company_users")
        .select("user_id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("role", "Owner")
        .eq("is_active", true);

      if (countError || !ownerCount || ownerCount.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner. Transfer ownership first." },
          { status: 400 }
        );
      }
    }

    // Prevent creating multiple owners through this endpoint
    if (role === "Owner" && memberToUpdate.role !== "Owner") {
      return NextResponse.json(
        { error: "Use the transfer ownership feature to make someone an owner" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: {
      updated_at: string;
      role?: "Owner" | "Member" | "Accountant";
    } = {
      updated_at: new Date().toISOString()
    };

    if (role !== undefined && role !== memberToUpdate.role) {
      updateData.role = role;
    }

    // Update user access if provided
    if (is_access_enabled !== undefined) {
      const { error: userUpdateError } = await supabase
        .from("users")
        .update({
          is_access_enabled,
          updated_at: new Date().toISOString()
        })
        .eq("id", memberId);

      if (userUpdateError) {
        console.error("Error updating user access:", userUpdateError);
        return NextResponse.json(
          { error: "Failed to update access status" },
          { status: 500 }
        );
      }
    }

    // Update role if changed
    if (updateData.role) {
      const { error: roleUpdateError } = await supabase
        .from("company_users")
        .update(updateData)
        .eq("user_id", memberId)
        .eq("company_id", companyId);

      if (roleUpdateError) {
        console.error("Error updating member role:", roleUpdateError);
        return NextResponse.json(
          { error: "Failed to update member role" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Member updated successfully"
    });

  } catch (error) {
    console.error("Error in member update endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
