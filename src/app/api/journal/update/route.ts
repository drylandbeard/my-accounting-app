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

    // First try to find by journal entry ID, then by transaction ID
    let transactionId = id;
    let existingEntry = null;
    
    // Try to find by journal entry ID first
    const { data: journalEntry } = await supabase
      .from('journal')
      .select('transaction_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();
    
    if (journalEntry) {
      // Found by journal entry ID
      existingEntry = journalEntry;
      transactionId = journalEntry.transaction_id;
    } else {
      // Try to find by transaction ID
      const { data: transactionEntry } = await supabase
        .from('journal')
        .select('transaction_id')
        .eq('transaction_id', id)
        .eq('company_id', companyId)
        .limit(1)
        .single();
      
      if (transactionEntry) {
        // Found by transaction ID
        existingEntry = transactionEntry;
        transactionId = id;
      }
    }

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      )
    }

    // Get the existing transaction data to preserve key fields
    const { data: existingTransaction } = await supabase
      .from('transactions')
      .select('corresponding_category_id, plaid_account_id, plaid_account_name, spent, received')
      .eq('id', transactionId)
      .eq('company_id', companyId)
      .single();

    if (!existingTransaction) {
      return NextResponse.json(
        { error: 'Existing transaction not found' },
        { status: 404 }
      )
    }

    // Delete existing journal entries for this transaction
    await supabase
      .from('journal')
      .delete()
      .eq('transaction_id', transactionId)
      .eq('company_id', companyId);

    // Delete the existing transaction by its ID directly
    await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('company_id', companyId);

    // Split transactions are handled via multiple journal entries

    // Create a single transaction entry that represents the journal entry
    // Preserve the original spent/received values to maintain transaction integrity
    const transactionEntry = {
      id: transactionId,
      date,
      description,
      spent: existingTransaction.spent, // Preserve original spent amount
      received: existingTransaction.received, // Preserve original received amount
      selected_category_id: transactions[0]?.account_id, // Use first entry's account as primary
      corresponding_category_id: existingTransaction.corresponding_category_id, // Preserve the original corresponding_category_id
      plaid_account_id: existingTransaction.plaid_account_id, // Preserve the original plaid_account_id
      plaid_account_name: existingTransaction.plaid_account_name, // Preserve the original plaid_account_name
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