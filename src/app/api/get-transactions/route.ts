import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    // 1. Get access_token and item_id from request body
    const { access_token, item_id } = await req.json();
    if (!access_token || !item_id) {
      return NextResponse.json({ error: 'Missing access_token or item_id' }, { status: 400 });
    }

    // 2. Fetch accounts from Plaid
    let accountsResponse;
    try {
      accountsResponse = await plaidClient.accountsGet({ access_token });
      console.log('Plaid accounts:', accountsResponse.data.accounts);
    } catch (err) {
      console.error('Plaid accountsGet error:', err);
      return NextResponse.json({ error: 'Failed to fetch accounts from Plaid' }, { status: 500 });
    }

    // 3. Upsert accounts and chart_of_accounts
    for (const account of accountsResponse.data.accounts) {
      const { account_id, name, balances, type, subtype } = account;

      // Upsert into accounts table
      const { error: upsertError } = await supabase.from('accounts').upsert({
        plaid_account_id: account_id,
        plaid_account_name: name,
        current_balance: balances.current ?? 0,
        starting_balance: balances.current ?? 0,
        last_synced: new Date().toISOString(),
        item_id,
        account_type: type,
        account_subtype: subtype
      }, { onConflict: 'plaid_account_id' });

      if (upsertError) console.error('Error upserting account:', upsertError);

      // Upsert into chart_of_accounts table
      let accountType = 'Asset';
      if (type === 'credit' || type === 'loan' || subtype === 'credit card') {
        accountType = 'Liability';
      }

      const { error: coaError } = await supabase.from('chart_of_accounts').upsert([{
        name: name,
        type: accountType,
        subtype: subtype,
        plaid_account_id: account_id
      }], { onConflict: ['name', 'type', 'subtype'] });

      if (coaError) console.error('Error upserting chart_of_accounts:', coaError);
    }

    // 4. Fetch transactions from Plaid
    let transactionsResponse;
    try {
      transactionsResponse = await plaidClient.transactionsGet({
        access_token,
        start_date: '2023-01-01',
        end_date: new Date().toISOString().split('T')[0],
      });
      console.log('Plaid transactions:', transactionsResponse.data.transactions);
    } catch (err) {
      console.error('Plaid transactionsGet error:', err);
      return NextResponse.json({ error: 'Failed to fetch transactions from Plaid' }, { status: 500 });
    }

    // 5. Insert new transactions into imported_transactions
    const plaidTransactions = transactionsResponse.data.transactions;
    for (const tx of plaidTransactions) {
      const { account_id, name, amount, date } = tx;

      // Find the account name from the accounts response
      const accountName = accountsResponse.data.accounts.find(
        acc => acc.account_id === account_id
      )?.name || null;

      // Check for duplicates
      const { data: existing } = await supabase
        .from('imported_transactions')
        .select('id')
        .eq('plaid_account_id', account_id)
        .eq('description', name)
        .eq('date', date)
        .eq('amount', amount);

      if (!existing || existing.length === 0) {
        const { error: insertError } = await supabase.from('imported_transactions').insert([{
          date,
          description: name,
          amount: -amount, // (expenses as negative, income as positive)
          plaid_account_id: account_id,
          item_id, // Link to plaid_items
          plaid_account_name: accountName // <-- now set correctly!
        }]);
        if (insertError) console.error('Error inserting transaction:', insertError);
      }
    }

    return NextResponse.json({ status: 'success' });
  } catch (err: any) {
    console.error('Sync failed:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}