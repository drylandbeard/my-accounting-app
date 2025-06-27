import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'

export async function DELETE(request: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    
    const body = await request.json()
    const { id, date, description } = body

    if (!id || !date || !description) {
      return NextResponse.json(
        { error: 'ID, date and description are required' },
        { status: 400 }
      )
    }

    // Find the transaction_id from existing journal entry
    const { data: existingEntry } = await supabase
      .from('journal')
      .select('transaction_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      )
    }

    const transactionId = existingEntry.transaction_id;

    // Delete journal entries
    await supabase
      .from('journal')
      .delete()
      .eq('transaction_id', transactionId)
      .eq('company_id', companyId);

    // Delete corresponding transactions
    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .eq('date', date)
      .eq('description', description)
      .eq('company_id', companyId);

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