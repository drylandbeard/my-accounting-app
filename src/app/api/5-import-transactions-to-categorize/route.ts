import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    // 1. Get parameters from request body
    const { access_token, item_id, start_date, end_date } = await req.json();
    
    if (!access_token || !item_id) {
      return NextResponse.json({ 
        error: 'Missing required fields: access_token or item_id' 
      }, { status: 400 });
    }

    // 2. Set default dates if not provided
    const end = end_date || new Date().toISOString().split('T')[0];
    const start = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 3. Fetch transactions from Plaid
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: start,
      end_date: end
    });

    // 4. Get account names for reference
    const { data: accounts } = await supabase
      .from('accounts')
      .select('plaid_account_id, plaid_account_name')
      .eq('plaid_item_id', item_id);

    const accountMap = new Map(
      accounts?.map(acc => [acc.plaid_account_id, acc.plaid_account_name]) || []
    );

    // 5. Transform transactions for storage
    const transactionsToStore = transactionsResponse.data.transactions.map(transaction => {
      // Use amount sign to determine spent/received
      const spent = transaction.amount > 0 ? transaction.amount : null;
      const received = transaction.amount < 0 ? Math.abs(transaction.amount) : null;

      return {
        date: transaction.date,
        description: transaction.name,
        plaid_account_id: transaction.account_id,
        plaid_account_name: accountMap.get(transaction.account_id) || null,
        item_id,
        spent,
        received
      };
    });

    // 6. Store transactions in imported_transactions table
    const { data: storedTransactions, error: transactionsError } = await supabase
      .from('imported_transactions')
      .insert(transactionsToStore)
      .select();

    if (transactionsError) {
      console.error('Error storing transactions:', transactionsError);
      return NextResponse.json({ 
        error: 'Failed to store transactions' 
      }, { status: 500 });
    }

    // 7. Return success response
    return NextResponse.json({ 
      status: 'success',
      transactions: storedTransactions,
      count: storedTransactions.length
    });

  } catch (err: any) {
    console.error('Transaction import failed:', err);
    return NextResponse.json({ 
      error: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'Failed to import transactions'
    }, { status: 500 });
  }
} 