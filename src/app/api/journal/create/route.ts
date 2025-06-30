import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'

export async function POST(request: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    
    const body = await request.json()
    const { date, description, entries, selectedAccountId } = body

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

    // Validate selectedAccountId is provided
    if (!selectedAccountId) {
      return NextResponse.json(
        { error: 'Selected account ID is required' },
        { status: 400 }
      );
    }

    // Get the selected account details to use as the transaction source
    const { data: selectedAccount, error: accountError } = await supabase
      .from('accounts')
      .select('plaid_account_id, name')
      .eq('plaid_account_id', selectedAccountId)
      .eq('company_id', companyId)
      .single();

    if (accountError || !selectedAccount) {
      return NextResponse.json(
        { error: 'Selected account not found' },
        { status: 400 }
      );
    }

    // Find the primary category (first entry's account)
    const primaryEntry = entries[0];

    // Calculate amounts based on accounting perspective
    const totalDebits = entries
      .filter(e => e.type === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);
    
    // Determine if this is primarily an expense (money out) or income (money in)
    // Look at the primary entry's account type from categories table
    const { data: primaryCategory } = await supabase
      .from('chart_of_accounts')
      .select('type')
      .eq('id', primaryEntry.account_id)
      .single();
    
    const isExpense = primaryCategory?.type === 'Expense' || primaryCategory?.type === 'Asset';
    
    // For the source account (asset account like checking):
    // - If primarily expense/asset: this is money going OUT (spent)
    // - If primarily revenue/liability: this is money coming IN (received)
    const spentAmount = isExpense ? totalDebits : 0;
    const receivedAmount = isExpense ? 0 : totalDebits;

    // Multiple journal entries handled via journal table entries

    // STEP 1: Create imported transaction (adds to "To Add" table)
    const importedTransactionEntry = {
      date,
      description,
      spent: spentAmount > 0 ? spentAmount.toFixed(4) : '0.0000',
      received: receivedAmount > 0 ? receivedAmount.toFixed(4) : '0.0000',
      plaid_account_id: selectedAccount.plaid_account_id,
      plaid_account_name: selectedAccount.name,
      company_id: companyId,
      selected_category_id: primaryEntry.account_id
    };

    // Insert into imported_transactions table (this adds it to "To Add" table)
    const { data: importedTx, error: importError } = await supabase
      .from('imported_transactions')
      .insert([importedTransactionEntry])
      .select()
      .single();

    if (importError) {
      console.error('Error inserting imported transaction:', importError);
      return NextResponse.json(
        { error: 'Failed to create imported transaction: ' + importError.message },
        { status: 500 }
      );
    }

    // STEP 2: Move to "Added" table (simulate the "Add Selection" button)
    const addedTransactionEntry = {
      date,
      description,
      spent: spentAmount > 0 ? spentAmount.toFixed(4) : '0.0000',
      received: receivedAmount > 0 ? receivedAmount.toFixed(4) : '0.0000',
      selected_category_id: primaryEntry.account_id,
      corresponding_category_id: entries.length === 2 ? 
        entries.find(e => e.account_id !== primaryEntry.account_id)?.account_id : null,
      plaid_account_id: selectedAccount.plaid_account_id,
      plaid_account_name: selectedAccount.name,
      company_id: companyId
    };

    // Insert into transactions table (this adds it to "Added" table)
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert([addedTransactionEntry]);

    if (transactionError) {
      console.error('Error inserting transaction entry:', transactionError);
      return NextResponse.json(
        { error: 'Failed to create transaction entry: ' + transactionError.message },
        { status: 500 }
      );
    }

    // STEP 3: Remove from "To Add" table (simulate the transaction being processed)
    const { error: deleteError } = await supabase
      .from('imported_transactions')
      .delete()
      .eq('id', importedTx.id);

    if (deleteError) {
      console.error('Error removing from imported transactions:', deleteError);
      // Don't fail the whole operation for this, just log it
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