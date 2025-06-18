import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseAdmin";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * Create chart of accounts entries from stored Plaid accounts
 * Handles duplicate entries gracefully using upsert logic
 */
export async function POST(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    const { accessToken, itemId, selectedAccountIds } = await req.json();
    
    if (!accessToken || !itemId) {
      return NextResponse.json({ 
        error: "Missing required fields: accessToken and itemId" 
      }, { status: 400 });
    }

    // Retrieve accounts stored in Step 3 (filtered by company)
    let query = supabase
      .from("accounts")
      .select("*")
      .eq("plaid_item_id", itemId)
      .eq("company_id", companyId);

    // Further filter by selected accounts if specified
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      query = query.in("plaid_account_id", selectedAccountIds);
    }

    const { data: accountRecords, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ 
        error: "Failed to retrieve accounts from database",
        details: fetchError.message
      }, { status: 500 });
    }

    if (!accountRecords || accountRecords.length === 0) {
      return NextResponse.json({ 
        error: "No accounts found. Please complete Step 3 first.",
        itemId: itemId
      }, { status: 400 });
    }

    // Transform accounts to chart of accounts entries
    const chartEntries = accountRecords.map(account => {
      // Classify account type based on Plaid account type
      const isLiabilityAccount = account.type === "credit" || account.type === "loan";
      
      return {
        id: crypto.randomUUID(),
        name: account.name,
        type: isLiabilityAccount ? "Liability" : "Asset",
        subtype: account.subtype,
        plaid_account_id: account.plaid_account_id,
        company_id: companyId,
        parent_id: null
      };
    });

    // Check for existing entries and only insert new ones to avoid foreign key conflicts
    const existingEntries = [];
    const newEntries = [];

    for (const entry of chartEntries) {
      const { data: existing } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("name", entry.name)
        .eq("type", entry.type)
        .eq("company_id", entry.company_id)
        .eq("subtype", entry.subtype || null)
        .single();

      if (existing) {
        existingEntries.push(existing);
      } else {
        newEntries.push(entry);
      }
    }

    // Only insert new entries
    let storedEntries = [];
    if (newEntries.length > 0) {
      const { data: insertedEntries, error: storageError } = await supabase
        .from("chart_of_accounts")
        .insert(newEntries)
        .select();

      if (storageError) {
        return NextResponse.json({ 
          error: "Failed to create chart of accounts entries",
          details: storageError.message
        }, { status: 500 });
      }

      storedEntries = insertedEntries || [];
    }

    return NextResponse.json({
      success: true,
      chart_accounts: storedEntries,
      count: storedEntries?.length || 0,
      message: `Successfully processed ${storedEntries?.length || 0} chart entries`
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create chart of accounts";
    
    return NextResponse.json({ 
      error: errorMessage,
      step: "create_chart_entries"
    }, { status: 500 });
  }
} 