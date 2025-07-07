import bcrypt from "bcryptjs";
import { supabase } from "./supabase";
import { sendVerificationCodeEmail, generateVerificationCode } from "./email";
import { getEmailService } from "./email/service";
import { createPresetCategories, createPresetPayees } from "./preset-categories";

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
export function createInvitationUrl(token: string): string {
  const baseUrl = process.env.NODE_ENV === "development" 
    ? "http://localhost:3000" 
    : process.env.NEXT_PUBLIC_BASE_URL || "https://www.use-switch.com";
  return `${baseUrl}/accept-invitation?token=${token}`;
}

/**
 * Send team member invitation
 */
export async function sendTeamInvitation(
  email: string, 
  role: "Owner" | "Member" | "Accountant", 
  companyId: string, 
  invitedByUserId: string
) {
  try {
    console.log("🔍 sendTeamInvitation - Starting process:", { email, role, companyId, invitedByUserId });
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    console.log("👤 Existing user check:", existingUser ? "User exists" : "New user");
    let userId;
    
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
      
      userId = existingUser.id;
    } else {
      // Create new user immediately with access disabled
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert({
          email,
          password_hash: "", // Will be set when they accept the invitation
          role: role as "Owner" | "Member" | "Accountant",
          is_access_enabled: false // Disabled until they accept invitation
        })
        .select()
        .single();

      if (userError || !newUser) {
        return { error: "Failed to create user" };
      }
      
      userId = newUser.id;
    }

    // Add user to company immediately (they'll be visible in team list)
    const { error: companyUserError } = await supabase
      .from("company_users")
      .insert({
        company_id: companyId,
        user_id: userId,
        role: role as "Owner" | "Member" | "Accountant"
      });

    if (companyUserError) {
      // If user was newly created and company association fails, clean up
      if (!existingUser) {
        await supabase.from("users").delete().eq("id", userId);
      }
      return { error: "Failed to add user to company" };
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
    console.log("🎫 Creating invitation token:", { userId, token: token.substring(0, 10) + "...", tokenType: "invitation" });
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: userId,
        token,
        token_type: "invitation",
        invited_email: email,
        invited_role: role,
        company_id: companyId,
        invited_by_user_id: invitedByUserId,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      console.error("❌ Token creation error:", tokenError);
      return { error: "Failed to create invitation token" };
    }
    
    console.log("✅ Invitation token created successfully");

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

    return { success: true, userId };
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
    console.log("🔍 acceptInvitation - Validating token:", token.substring(0, 10) + "...");
    
    // Get invitation token
    const { data: invitationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .eq("token_type", "invitation")
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
    console.log("🔍 completeInvitationSignup - Processing token:", token.substring(0, 10) + "...");
    
    // Get invitation token
    const { data: invitationToken, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .eq("token_type", "invitation")
      .single();

    console.log("🎫 Complete invitation token lookup:", { 
      found: !!invitationToken, 
      error: tokenError?.message,
      userId: invitationToken?.user_id
    });

    if (tokenError || !invitationToken) {
      console.log("❌ Complete invitation token validation failed:", tokenError?.message || "Token not found");
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
      return { error: "Failed to update user" };
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
        role: role as "Owner" | "Member" | "Accountant"
      }
    };
  } catch (error) {
    console.error("Complete invitation signup error:", error);
    return { error: "Failed to complete invitation signup" };
  }
}

/**
 * Sign up a new user with email verification code
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

    // Generate verification code (6 digits)
    const code = generateVerificationCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Expire in 10 minutes

    // Store verification code
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: user.id,
        token: code, // Store the 6-digit code as token
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      // Clean up user if token creation fails
      await supabase.from("users").delete().eq("id", user.id);
      return { error: "Failed to create verification code" };
    }

    // Send verification code email
    const emailResult = await sendVerificationCodeEmail({
      email: user.email,
      verificationCode: code
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
    // Create the company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (companyError || !company) {
      console.error("Error creating company:", companyError);
      return { error: companyError?.message || "Failed to create company" };
    }

    // Associate user with company as Owner
    const { error: userCompanyError } = await supabase
      .from("company_users")
      .insert({
        company_id: company.id,
        user_id: userId,
        role: "Owner",
      });

    if (userCompanyError) {
      console.error("Error associating user with company:", userCompanyError);
      // Try to clean up the company
      await supabase.from("companies").delete().eq("id", company.id);
      return { error: userCompanyError.message };
    }

    // Create preset categories for the new company
    const presetCategoriesResult = await createPresetCategories(company.id);
    if (presetCategoriesResult.error) {
      console.error("Failed to create preset categories:", presetCategoriesResult.error);
      // Don't fail company creation if preset categories fail
    }

    // Create preset payees for the new company
    const presetPayeesResult = await createPresetPayees(company.id);
    if (presetPayeesResult.error) {
      console.error("Failed to create preset payees:", presetPayeesResult.error);
      // Don't fail company creation if preset payees fail
    }

    console.log(`Company created successfully: ${company.id}`);
    return { 
      success: true, 
      company,
      presetCategoriesCreated: !!presetCategoriesResult.success,
      presetPayeesCreated: !!presetPayeesResult.success
    };
  } catch (error) {
    console.error("Unexpected error creating company:", error);
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
export async function updateUserRole(userId: string, newRole: "Owner" | "Member" | "Accountant") {
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

    if (user && user.role === "Owner") {
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
 * Resend verification code email
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

    // Generate new verification code (6 digits)
    const code = generateVerificationCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Expire in 10 minutes

    // Store new verification code
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: user.id,
        token: code, // Store the 6-digit code as token
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      return { error: "Failed to create verification code" };
    }

    // Send verification code email
    const emailResult = await sendVerificationCodeEmail({
      email: user.email,
      verificationCode: code
    });

    if (!emailResult.success) {
      return { error: "Failed to send verification email. Please try again." };
    }

    return { success: true };
  } catch {
    return { error: "Failed to resend verification email" };
  }
}

/**
 * Send accountant team member invitation
 */
export async function sendAccountantTeamInvitation(
  name: string,
  email: string, 
  accountantId: string
) {
  try {
    console.log("🔍 sendAccountantTeamInvitation - Starting process:", { name, email, accountantId });
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    console.log("👤 Existing user check:", existingUser ? "User exists" : "New user");
    let userId;
    
    if (existingUser) {
      // User exists, check if they're already a team member of this accountant
      const { data: existingMember } = await supabase
        .from("accountant_members")
        .select("id")
        .eq("member_id", existingUser.id)
        .eq("accountant_id", accountantId)
        .eq("is_active", true)
        .single();

      if (existingMember) {
        return { error: "User is already a member of your team" };
      }
      
      // Update the existing user's name if not already set
      await supabase
        .from("users")
        .update({ name })
        .eq("id", existingUser.id);
      
      userId = existingUser.id;
    } else {
      // Create new user immediately with access disabled
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert({
          email,
          name,
          password_hash: "", // Will be set when they accept the invitation
          role: "Member", // Team members are not Accountants themselves
          is_access_enabled: false // Disabled until they accept invitation
        })
        .select()
        .single();

      if (userError || !newUser) {
        return { error: "Failed to create user" };
      }
      
      userId = newUser.id;
    }

    // Add user to accountant team immediately (they'll be visible in team list)
    const { error: teamMemberError } = await supabase
      .from("accountant_members")
      .insert({
        accountant_id: accountantId,
        member_id: userId
      });

    if (teamMemberError) {
      // If user was newly created and team association fails, clean up
      if (!existingUser) {
        await supabase.from("users").delete().eq("id", userId);
      }
      return { error: "Failed to add user to team" };
    }

    // Get accountant details
    const { data: accountant, error: accountantError } = await supabase
      .from("users")
      .select("email")
      .eq("id", accountantId)
      .single();

    if (accountantError || !accountant) {
      return { error: "Accountant not found" };
    }

    // Generate invitation token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expire in 24 hours

    // Store invitation token
    console.log("🎫 Creating accountant invitation token:", { userId, token: token.substring(0, 10) + "...", tokenType: "accountant_invitation" });
    const { error: tokenError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id: userId,
        token,
        token_type: "accountant_invitation",
        invited_email: email,
        invited_role: "Member", // Default role for team members
        accountant_id: accountantId,
        invited_by_user_id: accountantId,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      console.error("❌ Token creation error:", tokenError);
      return { error: "Failed to create invitation token" };
    }
    
    console.log("✅ Accountant invitation token created successfully");

    // Send invitation email
    const invitationUrl = createAccountantInvitationUrl(token);
    const emailService = getEmailService();
    const emailResult = await emailService.sendInvitationEmail({
      email,
      invitationUrl,
      companyName: `${accountant.email}'s Team`,
      inviterName: accountant.email,
      role: "Member"
    });

    if (!emailResult.success) {
      // Clean up token if email fails
      await supabase
        .from("email_verification_tokens")
        .delete()
        .eq("token", token);
      return { error: "Failed to send invitation email. Please try again." };
    }

    return { success: true, memberId: userId };
  } catch (error) {
    console.error("Accountant team invitation error:", error);
    return { error: "Failed to send invitation" };
  }
}

/**
 * Create accountant invitation URL
 */
export function createAccountantInvitationUrl(token: string): string {
  const baseUrl = process.env.NODE_ENV === "development" 
    ? "http://localhost:3000" 
    : process.env.NEXT_PUBLIC_BASE_URL || "https://www.use-switch.com";
  return `${baseUrl}/accountant/accept-invite?token=${token}`;
} 