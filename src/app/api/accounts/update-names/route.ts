import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(request: NextRequest) {
  try {
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
        // Update accounts table - update both name and display_order
        await supabase
          .from('accounts')
          .update({ 
            name: account.name,
            display_order: account.order || 0
          })
          .eq('plaid_account_id', account.id);

        // Update chart_of_accounts table
        await supabase
          .from('chart_of_accounts')
          .update({ name: account.name })
          .eq('plaid_account_id', account.id);
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