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
    const { id, date, description, transactions, hasSplit } = body

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

    // Find the transaction_id from existing journal entry and get existing transaction data
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

    // Create split_data if transaction has been split
    let splitData = null;
    if (hasSplit && transactions.length > 2) {
      // Filter out the bank account entry (corresponding_category_id) to get only the split categories
      const splitTransactions = transactions.filter(tx => 
        tx.account_id !== existingTransaction.corresponding_category_id
      );
      
      splitData = {
        splits: splitTransactions.map(tx => ({
          id: uuidv4(),
          date: date,
          description: description,
          spent: tx.type === 'debit' ? tx.amount.toString() : '0.00',
          received: tx.type === 'credit' ? tx.amount.toString() : '0.00',
          selected_category_id: tx.account_id
        }))
      };
    }

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
      split_data: splitData, // Add split data if transaction was split
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