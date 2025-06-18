import bcrypt from "bcryptjs";
import { supabase } from "./supabaseClient";
import { sendVerificationEmail, generateVerificationToken, createVerificationUrl } from "./email";
import { getEmailService } from "./email/service";

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure token for invitations/verification
 */
export function generateToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create invitation URL
 */
export function createInvitationUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/accept-invitation?token=${token}`;
}

/**
 * Send team member invitation
 */
export async function sendTeamInvitation(
  email: string, 
  role: "Owner" | "User" | "Accountant", 
  companyId: string, 
  invitedByUserId: string
) {
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      // User exists, check if they're already a member of this company
      const { data: existingMember } = await supabase
        .from("company_users")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .single();

      if (existingMember) {
        return { error: "User is already a member of this company" };
      }
    }

    // Get company details
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return { error: "Company not found" };
    }

    // Get inviter details
    const { data: inviter, error: inviterError } = await supabase
      .from("users")
      .select("email")
      .eq("id", invitedByUserId)
      .single();

    if (inviterError || !inviter) {
      return { error: "Inviter not found" };
    }

    // Generate invitation token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expire in 24 hours

    // Store invitation token
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        token,
        token_type: "invitation",
        invited_email: email,
        invited_role: role,
        company_id: companyId,
        invited_by_user_id: invitedByUserId,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      console.error("Token creation error:", tokenError);
      return { error: "Failed to create invitation token" };
    }

    // Send invitation email
    const invitationUrl = createInvitationUrl(token);
    const emailService = getEmailService();
    const emailResult = await emailService.sendInvitationEmail({
      email,
      invitationUrl,
      companyName: company.name,
      inviterName: inviter.email,
      role
    });

    if (!emailResult.success) {
      // Clean up token if email fails
      await supabase
        .from("email_verification_tokens")
        .delete()
        .eq("token", token);
      return { error: "Failed to send invitation email. Please try again." };
    }

    return { success: true };
  } catch (error) {
    console.error("Team invitation error:", error);
    return { error: "Failed to send invitation" };
  }
}

/**
 * Accept team invitation with token
 */
export async function acceptInvitation(token: string) {
  try {
    // Get invitation token
    const { data: invitationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .eq("token_type", "invitation")
      .single();

    if (tokenError || !invitationToken) {
      return { error: "Invalid or expired invitation token" };
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(invitationToken.expires_at);
    if (now > expiresAt) {
      return { error: "Invitation has expired" };
    }

    // Check if token has already been used
    if (invitationToken.used_at) {
      return { error: "This invitation has already been accepted" };
    }

    return { 
      success: true, 
      invitation: {
        email: invitationToken.invited_email,
        role: invitationToken.invited_role,
        companyId: invitationToken.company_id,
        token
      }
    };
  } catch (error) {
    console.error("Accept invitation error:", error);
    return { error: "Failed to validate invitation" };
  }
}

/**
 * Complete invitation signup with password
 */
export async function completeInvitationSignup(token: string, password: string) {
  try {
    // Get invitation token
    const { data: invitationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .eq("token_type", "invitation")
      .single();

    if (tokenError || !invitationToken) {
      return { error: "Invalid or expired invitation token" };
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(invitationToken.expires_at);
    if (now > expiresAt) {
      return { error: "Invitation has expired" };
    }

    // Check if token has already been used
    if (invitationToken.used_at) {
      return { error: "This invitation has already been accepted" };
    }

    const email = invitationToken.invited_email;
    const role = invitationToken.invited_role;
    const companyId = invitationToken.company_id;

    // Check if user already exists
    let userId;
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, is_access_enabled")
      .eq("email", email)
      .single();

    if (existingUser) {
      // User exists, update their password and enable access
      const passwordHash = await hashPassword(password);
      const { error: updateError } = await supabase
        .from("users")
        .update({ 
          password_hash: passwordHash,
          is_access_enabled: true 
        })
        .eq("id", existingUser.id);

      if (updateError) {
        return { error: "Failed to update user" };
      }
      userId = existingUser.id;
    } else {
      // Create new user
      const passwordHash = await hashPassword(password);
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert({
          email,
          password_hash: passwordHash,
          role: role as "Owner" | "User" | "Accountant",
          is_access_enabled: true
        })
        .select()
        .single();

      if (userError || !newUser) {
        return { error: "Failed to create user" };
      }
      userId = newUser.id;
    }

    // Add user to company
    const { error: companyUserError } = await supabase
      .from("company_users")
      .insert({
        company_id: companyId,
        user_id: userId,
        role: role as "Owner" | "User" | "Accountant"
      });

    if (companyUserError) {
      return { error: "Failed to add user to company" };
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
    return { 
      success: true, 
      user: {
        id: userId,
        email,
        role: role as "Owner" | "User" | "Accountant"
      }
    };
  } catch (error) {
    console.error("Complete invitation signup error:", error);
    return { error: "Failed to complete invitation signup" };
  }
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(email: string, password: string) {
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return { error: "User already exists with this email" };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with access disabled initially
    const { data: user, error } = await supabase
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        role: "Owner",
        is_access_enabled: false // Require email verification
      })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    // Generate verification token
    const token = generateVerificationToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expire in 24 hours

    // Store verification token
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: user.id,
        token,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      // Clean up user if token creation fails
      await supabase.from("users").delete().eq("id", user.id);
      return { error: "Failed to create verification token" };
    }

    // Send verification email
    const verificationUrl = createVerificationUrl(token);
    const emailResult = await sendVerificationEmail({
      email: user.email,
      verificationUrl
    });

    if (!emailResult.success) {
      // Clean up user and token if email fails
      await supabase.from("email_verification_tokens").delete().eq("user_id", user.id);
      await supabase.from("users").delete().eq("id", user.id);
      return { error: "Failed to send verification email. Please try again." };
    }

    return { 
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_access_enabled: user.is_access_enabled
      },
      verificationSent: true 
    };
  } catch {
    return { error: "Failed to create user" };
  }
}

/**
 * Sign in a user with email and password
 */
export async function signIn(email: string, password: string) {
  try {
    // Get user by email
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return { error: "Invalid email or password" };
    }

    // Verify password first
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return { error: "Invalid email or password" };
    }

    // Check if user access is enabled (email verified)
    if (!user.is_access_enabled) {
      return { 
        error: "Please verify your email address before signing in. Check your inbox for a verification link.", 
        needsVerification: true,
        email: user.email
      };
    }

    // Get user's companies
    const { data: companies } = await supabase
      .from("company_users")
      .select(`
        company_id,
        role,
        companies (
          id,
          name,
          description
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true);

    // Transform the data to match the expected UserCompany interface
    const transformedCompanies = companies?.map(item => ({
      company_id: item.company_id,
      role: item.role,
      companies: Array.isArray(item.companies) ? item.companies[0] : item.companies
    })) || [];

    return { 
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      companies: transformedCompanies
    };
  } catch {
    return { error: "Failed to sign in" };
  }
}

/**
 * Create a new company for a user
 */
export async function createCompany(userId: string, name: string, description?: string) {
  try {
    // Create company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name,
        description
      })
      .select()
      .single();

    if (companyError) {
      return { error: companyError.message };
    }

    // Associate user with company as Owner
    const { error: associationError } = await supabase
      .from("company_users")
      .insert({
        company_id: company.id,
        user_id: userId,
        role: "Owner"
      });

    if (associationError) {
      return { error: associationError.message };
    }

    return { company };
  } catch {
    return { error: "Failed to create company" };
  }
}

/**
 * Get user's companies
 */
export async function getUserCompanies(userId: string) {
  try {
    const { data: companies, error } = await supabase
      .from("company_users")
      .select(`
        company_id,
        role,
        companies (
          id,
          name,
          description
        )
      `)
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      return { error: error.message };
    }

    return { companies: companies || [] };
  } catch {
    return { error: "Failed to get user companies" };
  }
}

/**
 * Update user email
 */
export async function updateUserEmail(userId: string, newEmail: string) {
  try {
    // Check if email already exists for another user
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", newEmail)
      .neq("id", userId)
      .single();

    if (existingUser) {
      return { error: "Email already exists for another user" };
    }

    const { error } = await supabase
      .from("users")
      .update({ email: newEmail })
      .eq("id", userId);

    if (error) {
      return { error: error.message };
    }

    return { success: true };
  } catch {
    return { error: "Failed to update email" };
  }
}

/**
 * Update user password
 */
export async function updateUserPassword(userId: string, currentPassword: string, newPassword: string) {
  try {
    // Get current user to verify password
    const { data: user, error } = await supabase
      .from("users")
      .select("password_hash")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return { error: "User not found" };
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return { error: "Current password is incorrect" };
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password_hash: newPasswordHash })
      .eq("id", userId);

    if (updateError) {
      return { error: updateError.message };
    }

    return { success: true };
  } catch {
    return { error: "Failed to update password" };
  }
}

/**
 * Update user role
 */
export async function updateUserRole(userId: string, newRole: "Owner" | "User" | "Accountant") {
  try {
    const { error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      return { error: error.message };
    }

    return { success: true };
  } catch {
    return { error: "Failed to update role" };
  }
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string) {
  try {
    // Get verification token (including used ones for better error handling)
    const { data: verificationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !verificationToken) {
      return { error: "Invalid or expired verification token" };
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(verificationToken.expires_at);
    if (now > expiresAt) {
      return { error: "Verification token has expired" };
    }

    // Check if token has already been used
    if (verificationToken.used_at) {
      // Check if the user is already verified
      const { data: user } = await supabase
        .from("users")
        .select("id, email, role, is_access_enabled")
        .eq("id", verificationToken.user_id)
        .single();

      if (user && user.is_access_enabled) {
        // User is already verified, return success with user data
        console.log("Token already used but user is verified, returning success");
        return { success: true, user: { id: user.id, email: user.email, role: user.role } };
      } else {
        return { error: "This verification link has already been used" };
      }
    }

    // Enable user access and mark token as used
    const { error: userError } = await supabase
      .from("users")
      .update({ is_access_enabled: true })
      .eq("id", verificationToken.user_id);

    if (userError) {
      return { error: "Failed to verify email" };
    }

    const { error: tokenUpdateError } = await supabase
      .from("email_verification_tokens")
      .update({ used_at: now.toISOString() })
      .eq("id", verificationToken.id);

    if (tokenUpdateError) {
      console.error("Failed to mark token as used:", tokenUpdateError);
    }

    // Get the user
    const { data: user } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("id", verificationToken.user_id)
      .single();

    if (user) {
      // Create default company "My Company" after successful verification
      const defaultCompanyResult = await createCompany(user.id, "My Company", "Default company");
      
      if (defaultCompanyResult.error) {
        console.error("Failed to create default company:", defaultCompanyResult.error);
      }
    }

    return { success: true, user };
  } catch {
    return { error: "Failed to verify email" };
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(email: string) {
  try {
    // Get user by email
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return { error: "User not found" };
    }

    // Check if user is already verified
    if (user.is_access_enabled) {
      return { error: "Email is already verified" };
    }

    // Deactivate any existing tokens for this user
    await supabase
      .from("email_verification_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);

    // Generate new verification token
    const token = generateVerificationToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expire in 24 hours

    // Store new verification token
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: user.id,
        token,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      return { error: "Failed to create verification token" };
    }

    // Send verification email
    const verificationUrl = createVerificationUrl(token);
    const emailResult = await sendVerificationEmail({
      email: user.email,
      verificationUrl
    });

    if (!emailResult.success) {
      return { error: "Failed to send verification email. Please try again." };
    }

    return { success: true };
  } catch {
    return { error: "Failed to resend verification email" };
  }
} 