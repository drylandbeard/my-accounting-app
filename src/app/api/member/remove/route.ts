import { NextRequest, NextResponse } from "next/server";
import { validateCompanyContext } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function DELETE(request: NextRequest) {
  try {
    const { memberId } = await request.json();
    console.log("🗑️ Remove member request:", { memberId });

    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Get company and user context
    const context = validateCompanyContext(request);
    if ("error" in context) {
      console.log("❌ Company context validation failed:", context.error);
      return NextResponse.json(
        { error: context.error },
        { status: 400 }
      );
    }

    const { companyId, userId } = context;
    console.log("✅ Company context:", { companyId, userId });

    // Check if the current user has permission (must be Owner)
    const { data: currentUserCompany, error: currentUserError } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (currentUserError || !currentUserCompany) {
      console.log("❌ Failed to get current user role:", currentUserError);
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Check if user is trying to remove themselves
    if (memberId === userId) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the company" },
        { status: 400 }
      );
    }

    // Get the member to be removed
    const { data: memberToRemove, error: memberError } = await supabase
      .from("company_users")
      .select("role, user_id")
      .eq("company_id", companyId)
      .eq("user_id", memberId)
      .eq("is_active", true)
      .single();

    if (memberError || !memberToRemove) {
      console.log("❌ Member not found:", memberError);
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Non-owners can only remove non-owners
    if (currentUserCompany.role !== "Owner" && memberToRemove.role === "Owner") {
      return NextResponse.json(
        { error: "Only owners can remove other owners" },
        { status: 403 }
      );
    }

    // Perform the removal (soft delete)
    const { error: removeError } = await supabase
      .from("company_users")
      .update({ is_active: false })
      .eq("company_id", companyId)
      .eq("user_id", memberId);

    if (removeError) {
      console.log("❌ Failed to remove member:", removeError);
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      );
    }

    // Also deactivate any accountant access if the member is an accountant
    if (memberToRemove.role === "Accountant") {
      await supabase
        .from("accountant_company_access")
        .update({ is_active: false })
        .eq("member_user_id", memberId)
        .eq("company_id", companyId);
    }

    console.log("✅ Member removed successfully");
    return NextResponse.json({
      message: "Member removed successfully"
    });
  } catch (error) {
    console.error("💥 Remove member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}