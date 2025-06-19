import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * Import transactions from Plaid and store in imported_transactions table
 * Uses account-specific date ranges as specified by user
 * Also creates starting balance transactions for each account using the start_date
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

    // Get account information including starting balance (filtered by company)
    const { data: accounts } = await supabase
      .from("accounts")
      .select("plaid_account_id, name, starting_balance")
      .eq("plaid_item_id", itemId)
      .eq("company_id", companyId);

    const accountMap = new Map(
      accounts?.map(acc => [acc.plaid_account_id, acc.name]) || []
    );

    // Create starting balance transactions for each account
    const startingBalanceTransactions = [];
    
    // Filter accounts by selectedAccountIds if specified
    const relevantAccounts = accounts?.filter(acc => 
      !selectedAccountIds || selectedAccountIds.length === 0 || selectedAccountIds.includes(acc.plaid_account_id)
    ) || [];

    for (const account of relevantAccounts) {
      const startDate = accountDateMap[account.plaid_account_id];
      if (startDate && account.starting_balance !== null && account.starting_balance !== 0) {
        const startingBalance = parseFloat(account.starting_balance.toString());
        
        // Determine if starting balance is spent or received based on sign
        const spent = startingBalance < 0 ? Math.abs(startingBalance) : 0;
        const received = startingBalance > 0 ? startingBalance : 0;

        startingBalanceTransactions.push({
          date: startDate,
          description: "Starting Balance",
          plaid_account_id: account.plaid_account_id,
          plaid_account_name: account.name,
          item_id: itemId,
          company_id: companyId,
          spent,
          received,
        });
      }
    }

    console.log("Creating starting balance transactions:", startingBalanceTransactions.length);

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

    // Combine starting balance transactions and regular transactions
    // Starting balance transactions come last so they appear at bottom (oldest dates)
    const allTransactionsToStore = [...transactionsToStore, ...startingBalanceTransactions];

    console.log("Total transactions to insert:", allTransactionsToStore.length, 
                "(", startingBalanceTransactions.length, "starting balance +", transactionsToStore.length, "regular)");

    // If no transactions to insert (no starting balances and no regular transactions)
    if (allTransactionsToStore.length === 0) {
      console.log("No transactions to import (no starting balances and no regular transactions)");
      return NextResponse.json({ 
        success: true, 
        count: 0, 
        startingBalanceCount: 0,
        regularTransactionCount: 0,
        message: "No transactions found to import",
        accountDateMap: accountDateMap,
        dateRange: { start: earliestStartDate, end: endDate }
      });
    }

    // Insert all transactions
    const { data, error } = await supabase
      .from("imported_transactions")
      .insert(allTransactionsToStore)
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
      startingBalanceCount: startingBalanceTransactions.length,
      regularTransactionCount: transactionsToStore.length,
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