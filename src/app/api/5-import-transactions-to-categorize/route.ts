import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * Import transactions from Plaid and store in imported_transactions table
 * Uses account-specific date ranges as specified by user
 */
export async function POST(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    const { accessToken, itemId, accountDateMap, selectedAccountIds } = await req.json();
    
    if (!accessToken || !itemId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log("Received accountDateMap from frontend:", accountDateMap);
    
    const endDate = new Date().toISOString().split("T")[0];
    
    // Calculate the earliest start date for the Plaid API call
    const startDates = Object.values(accountDateMap) as string[];
    const earliestStartDate = startDates.reduce((earliest, current) => 
      current < earliest ? current : earliest
    );

    console.log("Using date range for Plaid fetch:", earliestStartDate, "to", endDate);

    // Fetch transactions from Plaid using the earliest date to get all needed transactions
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: earliestStartDate,
      end_date: endDate,
    });

    console.log("Fetched transactions:", transactionsResponse.data.transactions.length);

    if (transactionsResponse.data.transactions.length === 0) {
      console.log("No transactions found in date range");
      return NextResponse.json({ success: true, count: 0, message: "No transactions found" });
    }

    // Get account names for mapping (filtered by company)
    const { data: accounts } = await supabase
      .from("accounts")
      .select("plaid_account_id, name")
      .eq("plaid_item_id", itemId)
      .eq("company_id", companyId);

    const accountMap = new Map(
      accounts?.map(acc => [acc.plaid_account_id, acc.name]) || []
    );

    // Filter transactions by selected accounts (if specified) AND by account-specific dates
    let filteredTransactions = transactionsResponse.data.transactions;
    
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      filteredTransactions = filteredTransactions.filter(txn => 
        selectedAccountIds.includes(txn.account_id)
      );
    }

    // Filter transactions by account-specific start dates
    filteredTransactions = filteredTransactions.filter(txn => {
      const accountStartDate = accountDateMap[txn.account_id];
      if (!accountStartDate) {
        console.warn(`No start date found for account ${txn.account_id}, skipping transaction`);
        return false;
      }
      return txn.date >= accountStartDate;
    });

    console.log("Filtered transactions after account-specific date check:", filteredTransactions.length);

    // Transform transactions for storage
    const transactionsToStore = filteredTransactions.map(transaction => {
      const spent = transaction.amount > 0 ? transaction.amount : 0;
      const received = transaction.amount < 0 ? Math.abs(transaction.amount) : 0;

      return {
        date: transaction.date,
        description: transaction.name,
        plaid_account_id: transaction.account_id,
        plaid_account_name: accountMap.get(transaction.account_id) || "Unknown Account",
        item_id: itemId,
        company_id: companyId,
        spent,
        received,
      };
    });

    console.log("Inserting transactions...");

    // Insert transactions
    const { data, error } = await supabase
      .from("imported_transactions")
      .insert(transactionsToStore)
      .select();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("✅ Successfully imported transactions:", data?.length);
    console.log("Account-specific date ranges used:", accountDateMap);
    
    return NextResponse.json({ 
      success: true, 
      count: data?.length,
      accountDateMap: accountDateMap,
      dateRange: { start: earliestStartDate, end: endDate }
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to import transactions";
    console.error("❌ Error:", errorMessage);
    
    return NextResponse.json({ 
      error: errorMessage,
      step: "import_transactions"
    }, { status: 500 });
  }
} 