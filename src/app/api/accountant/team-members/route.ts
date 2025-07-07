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
      .from("accountant_members")
      .select(`
        id,
        is_active,
        created_at,
        member:users!accountant_members_member_id_fkey(
          id,
          email,
          name,
          is_access_enabled
        )
      `)
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
      is_active: boolean; 
      created_at: string; 
      member: { 
        id: string; 
        email: string; 
        name: string; 
        is_access_enabled: boolean 
      } | { 
        id: string; 
        email: string; 
        name: string; 
        is_access_enabled: boolean 
      }[] 
    }) => {
      const member = Array.isArray(tm.member) ? tm.member[0] : tm.member;
      return {
        id: member.id,
        email: member.email,
        name: member.name || member.email.split('@')[0], // Fallback to email prefix if no name
        is_access_enabled: member.is_access_enabled,
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