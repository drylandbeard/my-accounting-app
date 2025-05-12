import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
  // 1. Fetch all transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*');

  if (txError) {
    console.error('Error fetching transactions:', txError.message);
    return NextResponse.json({ error: 'Error fetching transactions: ' + txError.message }, { status: 500 });
  }
  if (!transactions || transactions.length === 0) {
    console.warn('No transactions found.');
    return NextResponse.json({ error: 'No transactions found.' }, { status: 400 });
  }

  // 2. Clear the journal table
  const { error: clearError } = await supabase.from('journal').delete().not('id', 'is', null);
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
      });
      journalEntries.push({
        id: uuidv4(),
        transaction_id: tx.id,
        date: tx.date,
        description: tx.description,
        chart_account_id: tx.corresponding_category_id,
        debit: 0,
        credit: tx.spent,
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
      });
      journalEntries.push({
        id: uuidv4(),
        transaction_id: tx.id,
        date: tx.date,
        description: tx.description,
        chart_account_id: tx.corresponding_category_id,
        debit: tx.received,
        credit: 0,
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

  return NextResponse.json({ status: 'success', transactions: transactions.length, journalEntries: journalEntries.length });
}
