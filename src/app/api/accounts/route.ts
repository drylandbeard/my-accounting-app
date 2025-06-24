import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * GET /api/accounts
 * Fetch all accounts for the current company
 */
export async function GET(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // Fetch accounts for the company, ordered by display_order then by name
    const { data: accounts, error } = await supabase
      .from("accounts")
      .select("plaid_account_id, name, starting_balance, current_balance, last_synced, is_manual, institution_name, type, created_at, subtype, display_order")
      .eq("company_id", companyId)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching accounts:", error);
      return NextResponse.json({ 
        error: "Failed to fetch accounts" 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      accounts: accounts || []
    });

  } catch (err: unknown) {
    console.error("Error in GET /api/accounts:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 