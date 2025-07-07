import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    console.log("🔍 completeAccountantInvitation - Processing token:", token.substring(0, 10) + "...");
    
    // Get invitation token
    const { data: invitationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .eq("token_type", "accountant_invitation")
      .single();

    console.log("🎫 Complete invitation token lookup:", { 
      found: !!invitationToken, 
      error: tokenError?.message,
      userId: invitationToken?.user_id
    });

    if (tokenError || !invitationToken) {
      console.log("❌ Complete invitation token validation failed:", tokenError?.message || "Token not found");
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

    const email = invitationToken.invited_email;
    const userId = invitationToken.user_id;

    // User should already exist (created during invitation), just update password and enable access
    const passwordHash = await hashPassword(password);
    const { error: updateError } = await supabase
      .from("users")
      .update({ 
        password_hash: passwordHash,
        is_access_enabled: true 
      })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    // Mark token as used
    const { error: tokenUpdateError } = await supabase
      .from("email_verification_tokens")
      .update({ used_at: now.toISOString() })
      .eq("id", invitationToken.id);

    if (tokenUpdateError) {
      console.error("Failed to mark token as used:", tokenUpdateError);
    }

    // Return user data for sign-in
    return NextResponse.json({ 
      success: true, 
      user: {
        id: userId,
        email,
        role: "Member" // Team members are "Member" role, not the accountant team role
      }
    });
  } catch (error) {
    console.error("Complete accountant invitation error:", error);
    return NextResponse.json(
      { error: "Failed to complete invitation signup" },
      { status: 500 }
    );
  }
}
