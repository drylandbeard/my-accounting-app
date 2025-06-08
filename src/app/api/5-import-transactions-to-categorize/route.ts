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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Use exact date from frontend (already in YYYY-MM-DD format)
    console.log('Received startDate from frontend:', startDate);
    
    const endDate = new Date().toISOString().split('T')[0];
    const finalStartDate = startDate;

    console.log('Using date range:', finalStartDate, 'to', endDate);

    // Fetch transactions from Plaid
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: finalStartDate,
      end_date: endDate,
    });

    console.log('Fetched transactions:', transactionsResponse.data.transactions.length);

    if (transactionsResponse.data.transactions.length === 0) {
      console.log('No transactions found in date range');
      return NextResponse.json({ success: true, count: 0, message: 'No transactions found' });
    }

    // Get account names for mapping
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_id, name')
      .eq('plaid_item_id', itemId);

    const accountMap = new Map(
      accounts?.map(acc => [acc.account_id, acc.name]) || []
    );

    // Filter transactions by selected accounts (if specified) AND by date
    let filteredTransactions = transactionsResponse.data.transactions;
    
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      filteredTransactions = filteredTransactions.filter(txn => 
        selectedAccountIds.includes(txn.account_id)
      );
    }

    // Ensure we only get transactions from selected date forward
    filteredTransactions = filteredTransactions.filter(txn => 
      txn.date >= finalStartDate
    );

    console.log('Filtered transactions after date check:', filteredTransactions.length);

    // Transform transactions for storage
    const transactionsToStore = filteredTransactions.map(transaction => {
      const spent = transaction.amount > 0 ? transaction.amount : 0;
      const received = transaction.amount < 0 ? Math.abs(transaction.amount) : 0;

      return {
        date: transaction.date,
        description: transaction.name,
        plaid_account_id: transaction.account_id,
        plaid_account_name: accountMap.get(transaction.account_id) || 'Unknown Account',
        item_id: itemId,
        spent,
        received,
      };
    });

    console.log('Inserting transactions...');

    // Insert transactions
    const { data, error } = await supabase
      .from('imported_transactions')
      .insert(transactionsToStore)
      .select();

    if (error) {
      console.error('Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('✅ Successfully imported transactions:', data?.length);
    console.log('Date range used:', finalStartDate, 'to', endDate);
    
    return NextResponse.json({ 
      success: true, 
      count: data?.length,
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