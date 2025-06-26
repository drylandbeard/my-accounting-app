import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, description } = body

    if (!date || !description) {
      return NextResponse.json(
        { error: 'Date and description are required' },
        { status: 400 }
      )
    }

    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .eq('date', date)
      .eq('description', description);

    return NextResponse.json(
      { success: true, message: 'Journal entry deleted successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error deleting journal entry:', error)
    return NextResponse.json(
      { error: 'Failed to delete journal entry' },
      { status: 500 }
    )
  }
}