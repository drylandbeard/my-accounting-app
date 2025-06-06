import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseAdmin'
import { AccountSubtype } from 'plaid'

export async function POST(req: Request) {
  try {
    // 1. Get accounts from request body
    const { accounts } = await req.json();
    
    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ 
        error: 'Missing or invalid accounts array' 
      }, { status: 400 });
    }

    // 2. Transform accounts to chart entries
    const chartAccounts = accounts.map(account => ({
      name: account.name,
      type: account.type === 'credit' || account.type === 'loan' ? 'Liability' : 'Asset',
      subtype: account.subtype as AccountSubtype,
      plaid_account_id: account.plaid_account_id,
      metadata: {
        institution_name: account.institution_name,
        account_number: account.account_number
      }
    }));

    // 3. Store in chart_of_accounts
    const { data: storedChartAccounts, error: chartError } = await supabase
      .from('chart_of_accounts')
      .upsert(chartAccounts, { 
        onConflict: 'plaid_account_id'
      })
      .select();

    if (chartError) {
      console.error('Error storing chart of accounts:', chartError);
      return NextResponse.json({ 
        error: 'Failed to store chart of accounts' 
      }, { status: 500 });
    }

    // 4. Return success response
    return NextResponse.json({ 
      status: 'success',
      chart_accounts: storedChartAccounts
    });

  } catch (err: any) {
    console.error('Chart of accounts creation failed:', err);
    return NextResponse.json({ 
      error: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'Failed to create chart of accounts'
    }, { status: 500 });
  }
} 