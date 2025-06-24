import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * GET /api/transactions/imported
 * Fetch all imported transactions for the current company
 */
export async function GET(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // Fetch imported transactions for the company
    const { data: transactions, error } = await supabase
      .from("imported_transactions")
      .select("id, date, description, spent, received, plaid_account_id, plaid_account_name, selected_category_id, payee_id, company_id")
      .eq("company_id", companyId)
      .neq("plaid_account_name", null)
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching imported transactions:", error);
      return NextResponse.json({ 
        error: "Failed to fetch imported transactions" 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      transactions: transactions || []
    });

  } catch (err: unknown) {
    console.error("Error in GET /api/transactions/imported:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 