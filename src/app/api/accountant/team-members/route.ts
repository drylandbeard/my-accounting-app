import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
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
        { error: "Only Accountants can view team members" },
        { status: 403 }
      );
    }

    // Get team members for this accountant
    const { data: teamMembers, error: teamMembersError } = await supabase
      .from("accountant_members_list")
      .select("*")
      .eq("accountant_id", userId)
      .eq("is_active", true);

    if (teamMembersError) {
      console.error("Error fetching team members:", teamMembersError);
      return NextResponse.json(
        { error: "Failed to fetch team members" },
        { status: 500 }
      );
    }

    // Transform the data to match the expected format
    const transformedTeamMembers = (teamMembers || []).map((tm: { 
      id: string; 
      first_name: string;
      last_name: string;
      email: string;
      is_active: boolean; 
      is_access_enabled: boolean;
      created_at: string; 
    }) => {
      return {
        id: tm.id,
        email: tm.email,
        firstName: tm.first_name,
        lastName: tm.last_name,
        is_access_enabled: tm.is_access_enabled,
        created_at: tm.created_at
      };
    });

    return NextResponse.json({
      teamMembers: transformedTeamMembers
    });

  } catch (error) {
    console.error("Error in accountant team-members endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 