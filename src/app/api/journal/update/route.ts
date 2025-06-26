import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, description, transactions } = body

    if (!date || !description) {
      return NextResponse.json(
        { error: 'Date and description are required' },
        { status: 400 }
      )
    }

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Transactions are required' },
        { status: 400 }
      )
    }

    // Delete existing transactions
    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .eq('date', date)
      .eq('description', description);

    // Create new transactions
    for (const tx of transactions) {
      await supabase.from('transactions').insert([{
        date,
        description,
        spent: tx.type === 'debit' ? tx.amount.toFixed(4) : '0.0000',
        received: tx.type === 'credit' ? tx.amount.toFixed(4) : '0.0000',
        selected_category_id: tx.account_id,
        corresponding_category_id: null,
        plaid_account_id: 'MANUAL_ENTRY',
        plaid_account_name: 'Manual Journal Entry'
      }]);
    }

    return NextResponse.json(
      { success: true, message: 'Journal entry updated successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error updating journal entry:', error)
    return NextResponse.json(
      { error: 'Failed to update journal entry' },
      { status: 500 }
    )
  }
} 