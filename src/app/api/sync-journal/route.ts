import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Fetch all transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*');

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 });
    }

    let totalJournalRows = 0;

    for (const tx of transactions) {
      // Remove any existing journal entries for this transaction
      await supabase
        .from('journal')
        .delete()
        .eq('transaction_id', tx.id);

      // Determine the amount (either spent or received)
      const amount = Number(tx.spent) > 0 ? Number(tx.spent) : Number(tx.received);

      // Prepare journal rows
      const journalRows = [
        {
          transaction_id: tx.id,
          date: tx.date,
          description: tx.description,
          account_id: tx.debit_account_id,
          debit: amount,
          credit: 0
        },
        {
          transaction_id: tx.id,
          date: tx.date,
          description: tx.description,
          account_id: tx.credit_account_id,
          debit: 0,
          credit: amount
        }
      ];

      // Insert new journal rows
      const { error: journalError } = await supabase
        .from('journal')
        .insert(journalRows);

      if (journalError) {
        return NextResponse.json({ error: journalError.message }, { status: 500 });
      }

      totalJournalRows += 2;
    }

    return NextResponse.json({ success: true, totalJournalRows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
} 