import bcrypt from "bcryptjs";
import { supabase } from "./supabaseClient";

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
 * Sign in a user with email and password (client-safe - no email imports)
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
 * Create a new company for a user (client-safe - no email imports)
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