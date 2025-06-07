import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Setup Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Setup Plaid
const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
}));

export async function POST(req: Request) {
  try {
    const { accessToken, itemId, startDate, selectedAccountIds } = await req.json();
    
    if (!accessToken || !itemId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ✅ Use exact date from frontend (already in YYYY-MM-DD format)
    console.log('Step 5: Received startDate from frontend:', startDate);
    
    const endDate = new Date().toISOString().split('T')[0];
    const finalStartDate = startDate; // Direct use - no fallback needed

    console.log('Step 5: Using date range:', finalStartDate, 'to', endDate);

    // Fetch transactions from Plaid
    const transactionsResponse = await plaid.transactionsGet({
      access_token: accessToken,
      start_date: finalStartDate, // ✅ This will be exactly "2025-05-01"
      end_date: endDate,
    });

    console.log('Step 5: Fetched transactions:', transactionsResponse.data.transactions.length);

    if (transactionsResponse.data.transactions.length === 0) {
      console.log('Step 5: No transactions found in date range');
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
      filteredTransactions = filteredTransactions.filter(tx => 
        selectedAccountIds.includes(tx.account_id)
      );
    }

    // ✅ Extra filter to ensure we only get transactions from selected date forward
    filteredTransactions = filteredTransactions.filter(tx => 
      tx.date >= finalStartDate
    );

    console.log('Step 5: Filtered transactions after date check:', filteredTransactions.length);

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

    console.log('Step 5: Inserting transactions...');

    // Insert transactions
    const { data, error } = await supabase
      .from('imported_transactions')
      .insert(transactionsToStore)
      .select();

    if (error) {
      console.error('Step 5: Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Step 5: ✅ Successfully imported transactions:', data?.length);
    console.log('Step 5: Date range used:', finalStartDate, 'to', endDate);
    
    return NextResponse.json({ 
      success: true, 
      count: data?.length,
      dateRange: { start: finalStartDate, end: endDate }
    });

  } catch (error: any) {
    console.error('Step 5: Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}