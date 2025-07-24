import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

interface JournalEntry {
  id: string;
  transaction_id: string;
  date: string;
  description: string;
  chart_account_id: string;
  debit: number;
  credit: number;
  company_id: string;
}

export async function POST(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // 1. Get parameters from request body
    const { transaction_ids }: { transaction_ids: string[] } = await req.json();
    
    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return NextResponse.json({ 
        error: "Missing or empty transaction_ids array" 
      }, { status: 400 });
    }

    // 2. Get all transactions to undo (filtered by company) in one query
    const { data: transactionsToUndo, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .in("id", transaction_ids)
      .eq("company_id", companyId);

    if (fetchError || !transactionsToUndo) {
      console.error("Error fetching transactions to undo:", fetchError);
      return NextResponse.json({ 
        error: "Failed to fetch transactions to undo"
      }, { status: 500 });
    }

    // Check if all transactions were found
    if (transactionsToUndo.length !== transaction_ids.length) {
      const foundIds = new Set(transactionsToUndo.map(tx => tx.id));
      const missingIds = transaction_ids.filter(id => !foundIds.has(id));
      return NextResponse.json({ 
        error: `Some transactions were not found: ${missingIds.join(', ')}`
      }, { status: 404 });
    }

    // 3. Get journal entries for these transactions to check for splits and recreate split data
    const { data: journalEntries, error: journalFetchError } = await supabase
      .from('journal')
      .select('*')
      .in('transaction_id', transaction_ids)
      .eq('company_id', companyId);

    if (journalFetchError) {
      console.error('Error fetching journal entries:', journalFetchError);
      return NextResponse.json({ 
        error: `Failed to fetch journal entries: ${journalFetchError.message}` 
      }, { status: 500 });
    }

    // Group journal entries by transaction_id to identify splits
    const journalByTransaction = new Map<string, JournalEntry[]>();
    if (journalEntries) {
      journalEntries.forEach(entry => {
        const existing = journalByTransaction.get(entry.transaction_id) || [];
        existing.push(entry);
        journalByTransaction.set(entry.transaction_id, existing);
      });
    }

    // 4. Recreate split data for transactions that had splits (more than 2 journal entries)
    const splitDataToInsert = [];
    for (const tx of transactionsToUndo) {
      const entries = journalByTransaction.get(tx.id) || [];
      
      // If transaction has more than 2 journal entries, it was a split transaction
      if (entries.length > 2) {
        for (const entry of entries) {
          splitDataToInsert.push({
            imported_transaction_id: tx.id, // Will be replaced with new imported transaction ID
            date: entry.date,
            description: entry.description,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
            chart_account_id: entry.chart_account_id,
            company_id: companyId,
          });
        }
      }
    }

    // 5. Delete journal entries for these transactions in bulk
    const { error: journalDeleteError } = await supabase
      .from('journal')
      .delete()
      .in('transaction_id', transaction_ids)
      .eq('company_id', companyId);

    if (journalDeleteError) {
      console.error('Error deleting journal entries:', journalDeleteError);
      return NextResponse.json({ 
        error: `Failed to delete journal entries: ${journalDeleteError.message}` 
      }, { status: 500 });
    }

    // 6. Delete the transactions in bulk
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .in('id', transaction_ids)
      .eq('company_id', companyId);
      
    if (deleteError) {
      console.error('Error deleting transactions:', deleteError);
      return NextResponse.json({ 
        error: `Failed to delete transactions: ${deleteError.message}` 
      }, { status: 500 });
    }
    
    // 7. Insert back into imported_transactions in bulk
    const importedTransactionsToInsert = transactionsToUndo.map(tx => ({
      date: tx.date,
      description: tx.description,
      spent: tx.spent,
      received: tx.received,
      plaid_account_id: tx.plaid_account_id,
      plaid_account_name: tx.plaid_account_name,
      selected_category_id: tx.selected_category_id,
      payee_id: tx.payee_id,
              // No split_data needed - handled via journal entries
      company_id: companyId
    }));

    const { data: insertedImportedTransactions, error: insertError } = await supabase
      .from('imported_transactions')
      .insert(importedTransactionsToInsert)
      .select();

    if (insertError || !insertedImportedTransactions) {
      console.error('Error inserting into imported_transactions:', insertError);
      return NextResponse.json({ 
        error: `Failed to insert into imported_transactions: ${insertError?.message}` 
      }, { status: 500 });
    }

    // 8. Update split data with new imported transaction IDs and insert
    if (splitDataToInsert.length > 0) {
      // Create a mapping from old transaction ID to new imported transaction ID
      const transactionMapping = new Map<string, string>();
      for (let i = 0; i < transactionsToUndo.length; i++) {
        const oldTx = transactionsToUndo[i];
        const newImportedTx = insertedImportedTransactions[i];
        if (newImportedTx) {
          transactionMapping.set(oldTx.id, newImportedTx.id);
        }
      }

      // Update split data with correct imported transaction IDs
      const updatedSplitData = splitDataToInsert.map(split => ({
        ...split,
        imported_transaction_id: transactionMapping.get(split.imported_transaction_id) || split.imported_transaction_id
      }));

      const { error: splitInsertError } = await supabase
        .from('imported_transactions_split')
        .insert(updatedSplitData);

      if (splitInsertError) {
        console.error('Error inserting split data:', splitInsertError);
        // Don't fail the whole operation, but log the error
      }
    }

    // 9. Fetch the complete imported transactions with split information
    const importedTransactionIds = insertedImportedTransactions.map(tx => tx.id);
    
    // Get split counts for each imported transaction
    const { data: splitCounts } = await supabase
      .from('imported_transactions_split')
      .select('imported_transaction_id')
      .in('imported_transaction_id', importedTransactionIds)
      .eq('company_id', companyId);
    
    // Count splits per transaction
    const splitCountMap = new Map<string, number>();
    if (splitCounts) {
      splitCounts.forEach(entry => {
        const count = splitCountMap.get(entry.imported_transaction_id) || 0;
        splitCountMap.set(entry.imported_transaction_id, count + 1);
      });
    }
    
    // Add split information to the imported transactions
    const importedTransactionsWithSplitInfo = insertedImportedTransactions.map(tx => ({
      ...tx,
      // Convert numeric values to strings as expected by Transaction type
      spent: tx.spent ? tx.spent.toString() : undefined,
      received: tx.received ? tx.received.toString() : undefined,
      // A transaction is split if it has more than 2 split entries
      has_split: (splitCountMap.get(tx.id) || 0) > 2
    }));

    // 10. Return success response with the imported transactions
    return NextResponse.json({ 
      status: "success",
      processed: transactionsToUndo.length,
      message: `Successfully undid ${transactionsToUndo.length} transactions`,
      importedTransactions: importedTransactionsWithSplitInfo
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to undo transactions";
    console.error("Bulk transaction undo failed:", errorMessage);
    return NextResponse.json({ 
      error: process.env.NODE_ENV === "development" 
        ? errorMessage 
        : "Failed to undo transactions"
    }, { status: 500 });
  }
} 