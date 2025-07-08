import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing invitation token" },
        { status: 400 }
      );
    }

    console.log("🔍 acceptAccountantInvitation - Validating token:", token.substring(0, 10) + "...");
    
    // Get invitation token
    const { data: invitationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .eq("token_type", "acct_invite")
      .single();

    console.log("🎫 Token lookup result:", { 
      found: !!invitationToken, 
      error: tokenError?.message,
      tokenData: invitationToken ? {
        id: invitationToken.id,
        userId: invitationToken.user_id,
        email: invitationToken.invited_email,
        role: invitationToken.invited_role,
        used: !!invitationToken.used_at,
        expired: new Date() > new Date(invitationToken.expires_at)
      } : null
    });

    if (tokenError || !invitationToken) {
      console.log("❌ Token validation failed:", tokenError?.message || "Token not found");
      return NextResponse.json(
        { error: "Invalid or expired invitation token" },
        { status: 400 }
      );
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(invitationToken.expires_at);
    if (now > expiresAt) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 }
      );
    }

    // Check if token has already been used
    if (invitationToken.used_at) {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 400 }
      );
    }

    // Get the team member details
    const { data: teamMember, error: teamMemberError } = await supabase
      .from("accountant_members_list")
      .select("id, name, email")
      .eq("id", invitationToken.accountant_member_id)
      .single();

    if (teamMemberError || !teamMember) {
      return NextResponse.json(
        { error: "Team member record not found" },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      invitation: {
        email: teamMember.email,
        name: teamMember.name,
        accountantId: invitationToken.accountant_id,
        accountantMemberId: teamMember.id,
        token
      }
    });
  } catch (error) {
    console.error("Accept accountant invitation error:", error);
    return NextResponse.json(
      { error: "Failed to validate invitation" },
      { status: 500 }
    );
  }
}
