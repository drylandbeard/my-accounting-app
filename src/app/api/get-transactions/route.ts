import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'

export async function POST(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // 1. Get access_token, item_id, start_date, and selected_account_ids from request body
    const { access_token, item_id, start_date, selected_account_ids } = await req.json();
    if (!access_token || !item_id) {
      return NextResponse.json({ error: 'Missing access_token or item_id' }, { status: 400 });
    }

    // 2. Fetch accounts from Plaid
    let accountsResponse;
    try {
      accountsResponse = await plaidClient.accountsGet({ access_token });
      console.log('Plaid accounts:', accountsResponse.data.accounts);
    } catch (err: unknown) {
      // Enhanced error logging
      const safeAccessToken = access_token ? access_token.slice(0, 4) + '...' : 'none';
      console.error('Plaid accountsGet error:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const errorWithResponse = err as { response?: { data?: { error_message?: string } } };
        if (errorWithResponse.response) {
          console.error('Plaid error response:', errorWithResponse.response.data);
        }
      }
      console.error('Request context:', { item_id, access_token: safeAccessToken });
      // Return Plaid's error message in development
      const errorMsg = process.env.NODE_ENV === 'development' && 
        err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error_message?: string } } }).response?.data?.error_message || 'Failed to fetch accounts from Plaid'
        : 'Failed to fetch accounts from Plaid';
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    // 3. Upsert only selected accounts and chart_of_accounts
    for (const account of accountsResponse.data.accounts) {
      // Skip if account is not in selected_account_ids
      if (selected_account_ids && !selected_account_ids.includes(account.account_id)) {
        continue;
      }

      const { account_id, name, balances, type, subtype } = account;

      // Upsert into accounts table
      const { error: upsertError } = await supabase.from('accounts').upsert({
        plaid_account_id: account_id,
        name: name,
        current_balance: balances.current ?? 0,
        starting_balance: balances.current ?? 0,
        last_synced: new Date().toISOString(),
        plaid_item_id: item_id,
        type: type,
        subtype: subtype,
        company_id: companyId
      }, { onConflict: 'plaid_account_id,company_id' });

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
        plaid_account_id: account_id,
        company_id: companyId
      }], { onConflict: 'name,type,subtype,company_id' });

      if (coaError) console.error('Error upserting chart_of_accounts:', coaError);
    }

    // 4. Fetch transactions from Plaid
    let transactionsResponse;
    try {
      if (!start_date) {
        return NextResponse.json({ error: 'Start date is required' }, { status: 400 });
      }

      transactionsResponse = await plaidClient.transactionsGet({
        access_token,
        start_date,
        end_date: new Date().toISOString().split('T')[0],
      });
      console.log('Plaid transactions:', transactionsResponse.data.transactions);
    } catch (err: unknown) {
      // Enhanced error logging
      const safeAccessToken = access_token ? access_token.slice(0, 4) + '...' : 'none';
      console.error('Plaid transactionsGet error:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const errorWithResponse = err as { response?: { data?: { error_message?: string } } };
        if (errorWithResponse.response) {
          console.error('Plaid error response:', errorWithResponse.response.data);
        }
      }
      console.error('Request context:', { item_id, access_token: safeAccessToken });
      // Return Plaid's error message in development
      const errorMsg = process.env.NODE_ENV === 'development' && 
        err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error_message?: string } } }).response?.data?.error_message || 'Failed to fetch transactions from Plaid'
        : 'Failed to fetch transactions from Plaid';
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    // 5. Insert new transactions into imported_transactions (only for selected accounts)
    const plaidTransactions = transactionsResponse.data.transactions;
    for (const tx of plaidTransactions) {
      // Skip if transaction's account is not in selected_account_ids
      if (selected_account_ids && !selected_account_ids.includes(tx.account_id)) {
        continue;
      }

      const { account_id, name, amount, date } = tx;

      // Find the account name from the accounts response
      const accountName = accountsResponse.data.accounts.find(
        acc => acc.account_id === account_id
      )?.name || null;

      // Use amount sign to determine spent/received
      const spent = amount > 0 ? amount : 0;
      const received = amount < 0 ? Math.abs(amount) : 0;

      // Check for duplicates (using spent/received and company_id)
      const { data: existing } = await supabase
        .from('imported_transactions')
        .select('id')
        .eq('plaid_account_id', account_id)
        .eq('description', name)
        .eq('date', date)
        .eq('spent', spent)
        .eq('received', received)
        .eq('company_id', companyId);

      if (!existing || existing.length === 0) {
        const { error: insertError } = await supabase.from('imported_transactions').insert([{
          date,
          description: name,
          spent,
          received,
          plaid_account_id: account_id,
          item_id, // Link to plaid_items
          plaid_account_name: accountName,
          company_id: companyId
        }]);
        if (insertError) console.error('Error inserting transaction:', insertError);
      }
    }

    return NextResponse.json({ status: 'success' });
  } catch (err: unknown) {
    console.error('Sync failed:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}