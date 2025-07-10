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
    const { first_name, last_name } = await request.json();

    // Validate input
    if (first_name === undefined && last_name === undefined) {
      return NextResponse.json(
        { error: "At least one field (first_name or last_name) is required" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: {
      updated_at: string;
      first_name?: string;
      last_name?: string;
    } = {
      updated_at: new Date().toISOString()
    };

    if (first_name !== undefined) {
      updateData.first_name = first_name.trim();
    }
    
    if (last_name !== undefined) {
      updateData.last_name = last_name.trim();
    }

    // Update user profile
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId)
      .select("id, email, first_name, last_name, role")
      .single();

    if (updateError) {
      console.error("Error updating user profile:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });

  } catch (error) {
    console.error("Error in user update-profile endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
