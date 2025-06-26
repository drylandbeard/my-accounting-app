import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId } = body

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      )
    }

    // Delete from accounts table
    await supabase
      .from('accounts')
      .delete()
      .eq('plaid_account_id', accountId);

    // Delete from chart_of_accounts table
    await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('plaid_account_id', accountId);

    // Delete related transactions
    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_account_id', accountId);

    // Delete related imported transactions
    await supabase
      .from('imported_transactions')
      .delete()
      .eq('plaid_account_id', accountId);

    return NextResponse.json(
      { success: true, message: 'Account deleted successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}