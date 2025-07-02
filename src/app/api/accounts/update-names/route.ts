import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'

export async function PUT(request: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    const body = await request.json()
    const { accounts } = body

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json(
        { error: 'Accounts array is required' },
        { status: 400 }
      )
    }

    // Update each account
    for (const account of accounts) {
      if (account.id) {
        // The frontend sends plaid_account_id as "id", so use it directly
        const plaidAccountId = account.id;

        // Update accounts table - update both name and display_order
        const { error: accountUpdateError } = await supabase
          .from('accounts')
          .update({ 
            name: account.name,
            display_order: account.order || 0
          })
          .eq('plaid_account_id', plaidAccountId)
          .eq('company_id', companyId);

        if (accountUpdateError) {
          console.error('Error updating account:', accountUpdateError);
          continue;
        }

        // Update chart_of_accounts table using plaid_account_id relationship
        const { error: chartUpdateError } = await supabase
          .from('chart_of_accounts')
          .update({ name: account.name })
          .eq('plaid_account_id', plaidAccountId)
          .eq('company_id', companyId);

        if (chartUpdateError) {
          console.error('Error updating chart of accounts:', chartUpdateError);
        }
      }
    }

    return NextResponse.json(
      { success: true, message: 'Account names updated successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error updating account names:', error)
    return NextResponse.json(
      { error: 'Failed to update account names' },
      { status: 500 }
    )
  }
} 