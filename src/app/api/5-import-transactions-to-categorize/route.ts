import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'

/**
 * Import transactions from Plaid and store in imported_transactions table
 * Uses exact date range specified by user without fallback logic
 */
export async function POST(req: Request) {
  try {
    const { accessToken, itemId, startDate, selectedAccountIds } = await req.json();
    
    if (!accessToken || !itemId) {
      return NextResponse.json({ 
        error: 'Missing required fields: accessToken and itemId' 
      }, { status: 400 });
    }

    console.log('Received startDate from frontend:', startDate);
    
    const endDate = new Date().toISOString().split('T')[0];
    const finalStartDate = startDate;

    console.log('Date range:', finalStartDate, 'to', endDate);

    // Fetch transactions from Plaid API
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: finalStartDate,
      end_date: endDate
    });

        console.log('Fetched transactions:', transactionsResponse.data.transactions.length);

    // Return early if no transactions found
    if (transactionsResponse.data.transactions.length === 0) {
      console.log('No transactions found in date range');
      return NextResponse.json({ 
        success: true, 
        count: 0, 
        message: 'No transactions found',
        dateRange: { start: finalStartDate, end: endDate }
      });
    }

    const allTransactions = transactionsResponse.data.transactions;

    // Get account names for mapping
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('plaid_account_id, name')
      .eq('plaid_item_id', itemId);

    if (accountsError) {
      return NextResponse.json({ 
        error: 'Failed to fetch account information',
        details: accountsError.message
      }, { status: 500 });
    }

    // Create account lookup map
    const accountMap = new Map(
      accounts?.map(acc => [acc.plaid_account_id, acc.name]) || []
    );

    // Filter transactions by selected accounts if specified
    let filteredTransactions = allTransactions;
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      filteredTransactions = allTransactions.filter(transaction => 
        selectedAccountIds.includes(transaction.account_id)
      );
    }

    // Extra filter to ensure we only get transactions from selected date forward
    filteredTransactions = filteredTransactions.filter(transaction => 
      transaction.date >= finalStartDate
    );

    console.log('Filtered transactions after date check:', filteredTransactions.length);

    // Transform transactions for storage - matches working version approach
    const transactionsToStore = filteredTransactions.map(transaction => {
      const spent = transaction.amount > 0 ? transaction.amount : 0;
      const received = transaction.amount < 0 ? Math.abs(transaction.amount) : 0;

      return {
        id: crypto.randomUUID(),
        date: transaction.date,
        description: transaction.name,
        plaid_account_id: transaction.account_id,
        plaid_account_name: accountMap.get(transaction.account_id) || 'Unknown Account',
        item_id: itemId,
        spent,
        received
      };
    });

    console.log('Inserting transactions...');

    // Insert transactions into database
    const { data: storedTransactions, error: transactionsError } = await supabase
      .from('imported_transactions')
      .insert(transactionsToStore)
      .select();

    if (transactionsError) {
      console.error('❌ Insert error:', transactionsError);
      return NextResponse.json({ 
        error: 'Failed to store transactions',
        details: transactionsError.message
      }, { status: 500 });
    }

    console.log('✅ Successfully imported transactions:', storedTransactions?.length);
    console.log('Date range:', finalStartDate, 'to', endDate);
    
    // Return response
    return NextResponse.json({ 
      success: true, 
      count: storedTransactions?.length,
      dateRange: { start: finalStartDate, end: endDate }
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to import transactions';
    console.error('❌ Error:', errorMessage);
    
    return NextResponse.json({ 
      error: errorMessage,
      step: 'import_transactions'
    }, { status: 500 });
  }
} 