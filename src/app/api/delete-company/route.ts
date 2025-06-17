import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function DELETE(req: NextRequest) {
  try {
    // Debug: Log the headers we receive
    console.log("Delete company request headers:", {
      "x-company-id": req.headers.get("x-company-id"),
      "x-user-id": req.headers.get("x-user-id"),
    });

    // Validate company and user context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      console.log("Validation failed:", context.error);
      return NextResponse.json({ error: context.error }, { status: 400 });
    }

    const { companyId, userId } = context;

    // Check if user is the owner of the company
    // First, let's see what company_users exist for this company
    const { data: allCompanyUsers } = await supabase
      .from("company_users")
      .select("*")
      .eq("company_id", companyId);

    console.log("All company users for company:", companyId, allCompanyUsers);

    // Now check the specific user
    const { data: companyUserData, error: companyUserError } = await supabase
      .from("company_users")
      .select("role, is_active")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .single();

    console.log("Query params:", { companyId, userId });
    console.log("Company user data:", companyUserData);
    console.log("Company user error:", companyUserError);

    // Also check without the is_active filter
    const { data: companyUserDataAny } = await supabase
      .from("company_users")
      .select("role, is_active")
      .eq("company_id", companyId)
      .eq("user_id", userId);

    console.log("Company user data (any active status):", companyUserDataAny);

    if (companyUserError || !companyUserData) {
      // Check if this company has NO users at all - this might be a data integrity issue
      if (!allCompanyUsers || allCompanyUsers.length === 0) {
        console.log("Company has no users at all - this might be a data integrity issue");
        
        // Check if the user is the global owner and this company exists
        const { data: userData } = await supabase
          .from("users")
          .select("role")
          .eq("id", userId)
          .single();

        const { data: companyExists } = await supabase
          .from("companies")
          .select("id, name")
          .eq("id", companyId)
          .single();

        console.log("User global role:", userData?.role);
        console.log("Company exists:", companyExists);

        // Let's also see what companies DO exist
        const { data: allCompanies } = await supabase
          .from("companies")
          .select("id, name");
        
        console.log("All companies in database:", allCompanies);

        // And what companies this user should have access to
        const { data: userCompanies } = await supabase
          .from("company_users")
          .select(`
            company_id,
            role,
            companies (id, name)
          `)
          .eq("user_id", userId)
          .eq("is_active", true);

        console.log("User's companies from company_users:", userCompanies);

        // If user is a global Owner and company exists, add them as company owner
        if (userData?.role === "Owner" && companyExists) {
          console.log("Adding user as company owner to fix data integrity issue");
          
          const { error: insertError } = await supabase
            .from("company_users")
            .insert({
              company_id: companyId,
              user_id: userId,
              role: "Owner",
              is_active: true
            });

          if (insertError) {
            console.error("Failed to add user to company:", insertError);
            return NextResponse.json({ 
              error: "Failed to fix user association with company",
              debug: { insertError: insertError.message }
            }, { status: 500 });
          }

          console.log("Successfully added user as company owner");
          // Continue with deletion now that user is properly associated
        } else {
          return NextResponse.json({ 
            error: companyExists ? "User is not associated with this company and cannot be automatically added" : "Company does not exist",
            debug: {
              companyId,
              userId,
              userRole: userData?.role,
              companyExists: !!companyExists,
              allCompanyUsers,
              allCompanies,
              userCompanies
            }
          }, { status: companyExists ? 403 : 404 });
        }
      } else {
        return NextResponse.json({ 
          error: "User is not associated with this company",
          debug: {
            companyId,
            userId,
            allCompanyUsers,
            companyUserError: companyUserError?.message
          }
        }, { status: 403 });
      }
    }

    if (!companyUserData || !companyUserData.is_active) {
      return NextResponse.json({ error: "User access is not active for this company" }, { status: 403 });
    }

    if (companyUserData.role !== "Owner") {
      return NextResponse.json({ error: "Only company owners can delete companies" }, { status: 403 });
    }

    console.log("Role check passed - user is company owner");

    // Start transaction-like operations
    // Delete in order to handle foreign key constraints (based on schema)

    console.log("Starting deletion process for company:", companyId);

    // 1. Delete categorization_rules
    const { error: categorizationRulesError } = await supabase
      .from("categorization_rules")
      .delete()
      .eq("company_id", companyId);

    if (categorizationRulesError) {
      console.error("Error deleting categorization rules:", categorizationRulesError);
    }

    // 2. Delete imported_transactions
    const { error: importedTransactionsError } = await supabase
      .from("imported_transactions")
      .delete()
      .eq("company_id", companyId);

    if (importedTransactionsError) {
      console.error("Error deleting imported transactions:", importedTransactionsError);
    }

    // 3. Delete journal entries
    const { error: journalError } = await supabase
      .from("journal")
      .delete()
      .eq("company_id", companyId);

    if (journalError) {
      console.error("Error deleting journal entries:", journalError);
    }

    // 4. Delete transactions
    const { error: transactionsError } = await supabase
      .from("transactions")
      .delete()
      .eq("company_id", companyId);

    if (transactionsError) {
      console.error("Error deleting transactions:", transactionsError);
    }

    // 5. Delete chart_of_accounts
    const { error: chartAccountsError } = await supabase
      .from("chart_of_accounts")
      .delete()
      .eq("company_id", companyId);

    if (chartAccountsError) {
      console.error("Error deleting chart of accounts:", chartAccountsError);
    }

    // 6. Delete payees
    const { error: payeesError } = await supabase
      .from("payees")
      .delete()
      .eq("company_id", companyId);

    if (payeesError) {
      console.error("Error deleting payees:", payeesError);
    }

    // 7. Delete plaid_items
    const { error: plaidItemsError } = await supabase
      .from("plaid_items")
      .delete()
      .eq("company_id", companyId);

    if (plaidItemsError) {
      console.error("Error deleting plaid items:", plaidItemsError);
    }

    // 8. Delete accounts
    const { error: accountsError } = await supabase
      .from("accounts")
      .delete()
      .eq("company_id", companyId);

    if (accountsError) {
      console.error("Error deleting accounts:", accountsError);
    }

    // 9. Delete company_users associations
    const { error: companyUsersError } = await supabase
      .from("company_users")
      .delete()
      .eq("company_id", companyId);

    if (companyUsersError) {
      console.error("Error deleting company users:", companyUsersError);
      return NextResponse.json({ error: "Failed to delete company users" }, { status: 500 });
    }

    // 10. Finally, delete the company itself
    const { error: companyError } = await supabase
      .from("companies")
      .delete()
      .eq("id", companyId);

    if (companyError) {
      console.error("Error deleting company:", companyError);
      return NextResponse.json({ error: "Failed to delete company" }, { status: 500 });
    }

    console.log("Company deletion completed successfully");

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Unexpected error during company deletion:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 