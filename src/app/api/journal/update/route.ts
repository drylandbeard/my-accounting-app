import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'
import { validateCompanyContext } from '@/lib/auth-utils'

export async function PUT(request: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    
    const body = await request.json()
    const { id, date, description, transactions } = body

    if (!id || !date || !description) {
      return NextResponse.json(
        { error: 'ID, date and description are required' },
        { status: 400 }
      )
    }

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Transactions are required' },
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

    // Delete existing journal entries for this transaction
    await supabase
      .from('journal')
      .delete()
      .eq('transaction_id', transactionId)
      .eq('company_id', companyId);

    // Delete existing transactions for this journal entry
    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .eq('date', date)
      .eq('description', description)
      .eq('company_id', companyId);

    // Calculate totals for the single transaction entry
    const totalDebits = transactions
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalCredits = transactions
      .filter(tx => tx.type === 'credit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Create a single transaction entry that represents the journal entry
    const transactionEntry = {
      id: transactionId,
      date,
      description,
      spent: totalDebits > 0 ? totalDebits.toFixed(4) : '0.0000',
      received: totalCredits > 0 ? totalCredits.toFixed(4) : '0.0000',
      selected_category_id: transactions[0]?.account_id, // Use first entry's account as primary
      corresponding_category_id: null,
      plaid_account_id: 'MANUAL_ENTRY',
      plaid_account_name: 'Manual Journal Entry',
      company_id: companyId
    };

    // Prepare new journal entries
    const journalEntries = [];

    for (const tx of transactions) {
      // Add journal entry
      journalEntries.push({
        id: uuidv4(),
        transaction_id: transactionId,
        date,
        description,
        chart_account_id: tx.account_id,
        debit: tx.type === 'debit' ? tx.amount : 0,
        credit: tx.type === 'credit' ? tx.amount : 0,
        company_id: companyId,
      });
    }

    // Insert new transaction entry FIRST
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert([transactionEntry]);

    if (transactionError) {
      console.error('Error inserting transaction entry:', transactionError);
      return NextResponse.json(
        { error: 'Failed to update transaction entry: ' + transactionError.message },
        { status: 500 }
      );
    }

    // Insert new journal entries SECOND
    const { error: journalError } = await supabase
      .from('journal')
      .insert(journalEntries);

    if (journalError) {
      console.error('Error inserting journal entries:', journalError);
      return NextResponse.json(
        { error: 'Failed to update journal entries: ' + journalError.message },
        { status: 500 }
      );
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