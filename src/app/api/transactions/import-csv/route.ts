import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transactions } = body

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Transactions array is required' },
        { status: 400 }
      )
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: 'No transactions to import' },
        { status: 400 }
      )
    }

    // Insert selected transactions into imported_transactions
    const { data, error } = await supabase
      .from('imported_transactions')
      .insert(transactions)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      { 
        success: true, 
        message: `Successfully imported ${data?.length || 0} transactions`,
        count: data?.length || 0
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error importing transactions:', error)
    return NextResponse.json(
      { error: 'Failed to import transactions' },
      { status: 500 }
    )
  }
} 