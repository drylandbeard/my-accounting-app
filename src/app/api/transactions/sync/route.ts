import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'
import { toFinancialAmount } from '@/lib/financial'

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

    // 3. Update only balance and sync-related fields for selected accounts (preserve custom names)
    for (const account of accountsResponse.data.accounts) {
      // Skip if account is not in selected_account_ids
      if (selected_account_ids && !selected_account_ids.includes(account.account_id)) {
        continue;
      }

      const { account_id, balances, type, subtype } = account;

      // Update only balance, sync timestamp, and account type/subtype - DO NOT update name
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          current_balance: toFinancialAmount(balances.current ?? 0),
          last_synced: new Date().toISOString(),
          type: type,
          subtype: subtype
        })
        .eq('plaid_account_id', account_id)
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Error updating account balance:', updateError);
      }

      // Note: We don't update chart_of_accounts during sync operations
      // to preserve custom account names that users have set
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
        options: {
          count: 500, // Maximum transactions per request (default is 100)
        }
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
    let newTransactionsCount = 0;

    for (const tx of plaidTransactions) {
      // Skip if transaction's account is not in selected_account_ids
      if (selected_account_ids && !selected_account_ids.includes(tx.account_id)) {
        continue;
      }

      const { account_id, name, amount, date } = tx;

      // Get the account name from our database (preserving custom names)
      const { data: accountData } = await supabase
        .from('accounts')
        .select('name')
        .eq('plaid_account_id', account_id)
        .eq('company_id', companyId)
        .single();

      const accountName = accountData?.name || 'Unknown Account';

      // Use amount sign to determine spent/received with precise financial amounts
      const spentAmount = amount > 0 ? toFinancialAmount(amount) : toFinancialAmount(0);
      const receivedAmount = amount < 0 ? toFinancialAmount(Math.abs(amount)) : toFinancialAmount(0);

      // Check for duplicates (using spent/received and company_id)
      const { data: existing } = await supabase
        .from('imported_transactions')
        .select('id')
        .eq('plaid_account_id', account_id)
        .eq('description', name)
        .eq('date', date)
        .eq('spent', spentAmount)
        .eq('received', receivedAmount)
        .eq('company_id', companyId);

      if (!existing || existing.length === 0) {
        const { error: insertError } = await supabase.from('imported_transactions').insert([{
          date,
          description: name,
          spent: spentAmount,
          received: receivedAmount,
          plaid_account_id: account_id,
          item_id, // Link to plaid_items
          plaid_account_name: accountName, // Use custom name from database
          company_id: companyId
        }]);
        
        if (insertError) {
          console.error('Error inserting transaction:', insertError);
        } else {
          newTransactionsCount++;
        }
      }
    }

    return NextResponse.json({ 
      status: 'success', 
      newTransactions: newTransactionsCount 
    });
  } catch (err: unknown) {
    console.error('Sync failed:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}