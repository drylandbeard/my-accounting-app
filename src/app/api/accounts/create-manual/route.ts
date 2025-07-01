import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    // Validate authentication and company context
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json(
        { error: context.error },
        { status: 401 }
      );
    }

    const { companyId } = context;
    const body = await request.json();
    const { name, type, startingBalance } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Account name is required" },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { error: "Account type is required" },
        { status: 400 }
      );
    }

    // Generate unique ID for the account
    const accountId = randomUUID();
    const balance = parseFloat(startingBalance || "0");

    // Get the highest display_order to ensure this account appears last
    const { data: maxOrderData } = await supabase
      .from("accounts")
      .select("display_order")
      .eq("company_id", companyId)
      .order("display_order", { ascending: false })
      .limit(1);
    
    const maxOrder = maxOrderData?.[0]?.display_order || 0;
    const newDisplayOrder = maxOrder + 1;

    // Insert into accounts table first
    const { data: accountData, error: accountError } = await supabase
      .from("accounts")
      .insert({
        plaid_account_id: accountId, // Manual accounts don't have plaid IDs
        name: name.trim(),
        type: type,
        starting_balance: balance,
        current_balance: balance,
        plaid_item_id: "manual", // Special value for manual accounts
        company_id: companyId,
        institution_name: "Manual Account",
        is_manual: true,
        subtype: "manual",
        account_number: null,
        last_synced: new Date().toISOString(),
        display_order: newDisplayOrder,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (accountError) {
      console.error("Error creating account:", accountError);
      return NextResponse.json(
        { error: "Failed to create manual account" },
        { status: 500 }
      );
    }

    // Insert into chart_of_accounts table
    const { error: chartError } = await supabase
      .from("chart_of_accounts")
      .insert({
        name: name.trim(),
        type: type,
        subtype: "manual", // Mark as manual account
        company_id: companyId,
        plaid_account_id: accountId, // Manual accounts don't have plaid IDs
      })
      .select()
      .single();

    if (chartError) {
      console.error("Error creating chart of accounts entry:", chartError);
      // If chart_of_accounts fails, clean up the accounts entry
      await supabase.from("accounts").delete().eq("id", accountData.id);
      return NextResponse.json(
        { error: "Failed to create manual account" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        accountId: accountId,
        message: "Manual account created successfully",
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Error creating manual account:", error);
    return NextResponse.json(
      { error: "Failed to create manual account" },
      { status: 500 }
    );
  }
}
