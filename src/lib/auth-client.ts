import bcrypt from "bcryptjs";
import { supabase } from "./supabase";
import { createPresetCategories, createPresetPayees } from "./preset-categories";
import { UserCompany } from "@/zustand/authStore";

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

    // Get user's companies (both direct access and accountant-granted access)
    const { data: directCompanies } = await supabase
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

    // Get accountant-granted company access
    const { data: grantedCompanies } = await supabase
      .from("accountant_company_access")
      .select(`
        company_id,
        accountant_id,
        companies (
          id,
          name,
          description
        )
      `)
      .eq("member_user_id", user.id)
      .eq("is_active", true);

    // Transform direct companies
    const transformedDirectCompanies = directCompanies?.map(item => ({
      company_id: item.company_id,
      role: item.role,
      companies: Array.isArray(item.companies) ? item.companies[0] : item.companies,
      access_type: "direct" as const
    })) || [];

    // Transform granted companies
    const transformedGrantedCompanies = grantedCompanies?.map(item => ({
      company_id: item.company_id,
      role: "Member" as const, // ATMs always have Member role for granted companies
      companies: Array.isArray(item.companies) ? item.companies[0] : item.companies,
      access_type: "granted" as const,
      granted_by_accountant: "Accountant" // We'll fetch the actual name in the UI layer
    })) || [];

    // Merge both types of access, avoiding duplicates
    const allCompanies: UserCompany[] = [...transformedDirectCompanies];
    transformedGrantedCompanies.forEach(grantedCompany => {
      const isDuplicate = allCompanies.some(directCompany => 
        directCompany.company_id === grantedCompany.company_id
      );
      if (!isDuplicate) {
        allCompanies.push(grantedCompany);
      }
    });

    return { 
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      companies: allCompanies
    };
  } catch {
    return { error: "Failed to sign in" };
  }
}

/**
 * Create a new company for a user (client-safe - no email imports)
 */
export const createCompany = async (userId: string, name: string, description?: string) => {
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
    }

    // Create preset payees for the new company
    const presetPayeesResult = await createPresetPayees(company.id);
    
    if (presetPayeesResult.error) {
      console.error("Failed to create preset payees:", presetPayeesResult.error);
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
};

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