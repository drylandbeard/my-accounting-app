import { NextRequest, NextResponse } from "next/server";
import { validateCompanyContext } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { newOwnerId } = await request.json();
    console.log("🔄 Transfer ownership request:", { newOwnerId });

    if (!newOwnerId) {
      return NextResponse.json(
        { error: "New owner ID is required" },
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

    const { companyId, userId: currentUserId } = context;
    console.log("✅ Company context:", { companyId, currentUserId, newOwnerId });

    // Verify current user is the owner
    const { data: currentUserRole, error: currentUserError } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", currentUserId)
      .eq("is_active", true)
      .single();

    if (currentUserError || !currentUserRole) {
      console.log("❌ Current user role check failed:", currentUserError);
      return NextResponse.json(
        { error: "Unable to verify current user role" },
        { status: 400 }
      );
    }

    if (currentUserRole.role !== "Owner") {
      return NextResponse.json(
        { error: "Only owners can transfer ownership" },
        { status: 403 }
      );
    }

    // Verify new owner exists and is a member of the company
    const { data: newOwnerRole, error: newOwnerError } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", newOwnerId)
      .eq("is_active", true)
      .single();

    if (newOwnerError || !newOwnerRole) {
      console.log("❌ New owner role check failed:", newOwnerError);
      return NextResponse.json(
        { error: "New owner must be a member of this company" },
        { status: 400 }
      );
    }

    if (newOwnerRole.role === "Owner") {
      return NextResponse.json(
        { error: "Selected user is already an owner" },
        { status: 400 }
      );
    }

    // Get the new owner's email separately
    const { data: newOwnerUser, error: newOwnerUserError } = await supabase
      .from("users")
      .select("email")
      .eq("id", newOwnerId)
      .single();

    if (newOwnerUserError || !newOwnerUser) {
      console.log("❌ New owner user lookup failed:", newOwnerUserError);
      return NextResponse.json(
        { error: "Unable to find new owner user details" },
        { status: 400 }
      );
    }

    // Perform the ownership transfer in a transaction
    console.log("🔄 Starting ownership transfer...");
    
    // Update current owner to Member role
    const { error: demoteError } = await supabase
      .from("company_users")
      .update({ role: "Member" })
      .eq("company_id", companyId)
      .eq("user_id", currentUserId);

    if (demoteError) {
      console.error("❌ Failed to demote current owner:", demoteError);
      return NextResponse.json(
        { error: "Failed to transfer ownership" },
        { status: 500 }
      );
    }

    // Update new owner to Owner role
    const { error: promoteError } = await supabase
      .from("company_users")
      .update({ role: "Owner" })
      .eq("company_id", companyId)
      .eq("user_id", newOwnerId);

    if (promoteError) {
      console.error("❌ Failed to promote new owner:", promoteError);
      
      // Rollback: restore current user to Owner
      await supabase
        .from("company_users")
        .update({ role: "Owner" })
        .eq("company_id", companyId)
        .eq("user_id", currentUserId);
      
      return NextResponse.json(
        { error: "Failed to transfer ownership" },
        { status: 500 }
      );
    }

    console.log("✅ Ownership transferred successfully");
    
    return NextResponse.json({
      message: "Ownership transferred successfully",
      newOwner: {
        id: newOwnerId,
        email: newOwnerUser.email
      }
    });
  } catch (error) {
    console.error("💥 Transfer ownership error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 