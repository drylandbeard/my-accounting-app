import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAdmin';
import { v4 as uuidv4 } from 'uuid';
import { validateCompanyContext } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // 1. Fetch all transactions for the current company
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', companyId);

    if (txError) {
      console.error('Error fetching transactions:', txError.message);
      return NextResponse.json({ error: 'Error fetching transactions: ' + txError.message }, { status: 500 });
    }
    if (!transactions || transactions.length === 0) {
      console.warn('No transactions found for company.');
      return NextResponse.json({ error: 'No transactions found for company.' }, { status: 400 });
    }

    // 2. Clear the journal table for the current company
    const { error: clearError } = await supabase
      .from('journal')
      .delete()
      .eq('company_id', companyId);
    
    if (clearError) {
      console.error('Error clearing journal table:', clearError.message);
      return NextResponse.json({ error: 'Error clearing journal table: ' + clearError.message }, { status: 500 });
    }

    // 3. Prepare new journal entries with clear logic
    const journalEntries = [];
    for (const tx of transactions) {
      // If spent > 0: debit selected, credit corresponding
      if (tx.spent && tx.spent > 0) {
        journalEntries.push({
          id: uuidv4(),
          transaction_id: tx.id,
          date: tx.date,
          description: tx.description,
          chart_account_id: tx.selected_category_id,
          debit: tx.spent,
          credit: 0,
          company_id: companyId,
        });
        journalEntries.push({
          id: uuidv4(),
          transaction_id: tx.id,
          date: tx.date,
          description: tx.description,
          chart_account_id: tx.corresponding_category_id,
          debit: 0,
          credit: tx.spent,
          company_id: companyId,
        });
      }
      // If received > 0: credit selected, debit corresponding
      if (tx.received && tx.received > 0) {
        journalEntries.push({
          id: uuidv4(),
          transaction_id: tx.id,
          date: tx.date,
          description: tx.description,
          chart_account_id: tx.selected_category_id,
          debit: 0,
          credit: tx.received,
          company_id: companyId,
        });
        journalEntries.push({
          id: uuidv4(),
          transaction_id: tx.id,
          date: tx.date,
          description: tx.description,
          chart_account_id: tx.corresponding_category_id,
          debit: tx.received,
          credit: 0,
          company_id: companyId,
        });
      }
    }

    if (journalEntries.length === 0) {
      console.warn('No journal entries to insert.');
      return NextResponse.json({ error: 'No journal entries to insert.' }, { status: 400 });
    }

    // 4. Insert new journal entries
    const { error: insertError } = await supabase.from('journal').insert(journalEntries);
    if (insertError) {
      console.error('Error inserting journal entries:', insertError.message);
      return NextResponse.json({ error: 'Error inserting journal entries: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      status: 'success', 
      transactions: transactions.length, 
      journalEntries: journalEntries.length 
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Sync journal error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
