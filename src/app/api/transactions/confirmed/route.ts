import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * GET /api/transactions/confirmed
 * Fetch all confirmed transactions for the current company
 */
export async function GET(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // Fetch confirmed transactions for the company
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, date, description, spent, received, plaid_account_id, plaid_account_name, selected_category_id, corresponding_category_id, payee_id, company_id")
      .eq("company_id", companyId)
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching confirmed transactions:", error);
      return NextResponse.json({ 
        error: "Failed to fetch confirmed transactions" 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      transactions: transactions || []
    });

  } catch (err: unknown) {
    console.error("Error in GET /api/transactions/confirmed:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 