import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";
import { sendAccountantTeamInvitation } from "@/lib/auth";

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
        { error: "Only Accountants can invite team members" },
        { status: 403 }
      );
    }

    // Parse request body
    const { name, email } = await request.json();

    // Validate input
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Prevent accountant from adding themselves as a team member
    if (email.toLowerCase() === user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "You cannot add yourself as a team member" },
        { status: 400 }
      );
    }

    // Send team invitation
    const result = await sendAccountantTeamInvitation(name, email, userId);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Team member invitation sent successfully",
      memberId: result.memberId
    });

  } catch (error) {
    console.error("Error in accountant invite-member endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
