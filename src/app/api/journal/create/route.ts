import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, description, entries } = body

    if (!date || !description) {
      return NextResponse.json(
        { error: 'Date and description are required' },
        { status: 400 }
      )
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'Journal entries are required' },
        { status: 400 }
      )
    }

    // Validate that both lines have account_id and nonzero amount
    for (const entry of entries) {
      if (!entry.account_id || !entry.amount || entry.amount <= 0) {
        return NextResponse.json(
          { error: 'Each line must have an account and a nonzero amount' },
          { status: 400 }
        )
      }
    }

    // Insert transactions
    for (const entry of entries) {
      await supabase.from('transactions').insert([{
        date,
        description,
        spent: entry.type === 'debit' ? entry.amount.toFixed(4) : '0.0000',
        received: entry.type === 'credit' ? entry.amount.toFixed(4) : '0.0000',
        selected_category_id: entry.account_id,
        corresponding_category_id: null,
        plaid_account_id: 'MANUAL_ENTRY',
        plaid_account_name: 'Manual Journal Entry'
      }]);
    }

    return NextResponse.json(
      { success: true, message: 'Journal entry created successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error creating journal entry:', error)
    return NextResponse.json(
      { error: 'Failed to create journal entry' },
      { status: 500 }
    )
  }
} 