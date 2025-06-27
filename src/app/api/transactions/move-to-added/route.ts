import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";
import { toFinancialAmount } from "@/lib/financial";
import { v4 as uuidv4 } from 'uuid';

interface BulkTransactionRequest {
  imported_transaction_id: string;
  selected_category_id: string;
  corresponding_category_id: string;
  payee_id?: string;
}

interface SplitItem {
  id: string;
  date: string;
  description: string;
  spent: string;
  received: string;
  payee_id?: string;
  selected_category_id: string;
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
    const { transactions }: { transactions: BulkTransactionRequest[] } = await req.json();
    
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ 
        error: "Missing or empty transactions array" 
      }, { status: 400 });
    }

    // Validate all transactions have required fields
    for (const tx of transactions) {
      if (!tx.imported_transaction_id || !tx.selected_category_id || !tx.corresponding_category_id) {
        return NextResponse.json({ 
          error: "Missing required fields in one or more transactions" 
        }, { status: 400 });
      }
    }

    // 2. Get all imported transactions (filtered by company) in one query
    const importedTransactionIds = transactions.map(tx => tx.imported_transaction_id);
    const { data: importedTransactions, error: fetchError } = await supabase
      .from("imported_transactions")
      .select("*")
      .in("id", importedTransactionIds)
      .eq("company_id", companyId);

    if (fetchError || !importedTransactions) {
      console.error("Error fetching imported transactions:", fetchError);
      return NextResponse.json({ 
        error: "Failed to fetch imported transactions"
      }, { status: 500 });
    }

    // Check if all transactions were found
    if (importedTransactions.length !== transactions.length) {
      const foundIds = new Set(importedTransactions.map(tx => tx.id));
      const missingIds = importedTransactionIds.filter(id => !foundIds.has(id));
      return NextResponse.json({ 
        error: `Some transactions were not found or already processed: ${missingIds.join(', ')}`
      }, { status: 409 });
    }

    // 3. Create transaction records in bulk
    const transactionsToInsert = transactions.map(txRequest => {
      const importedTx = importedTransactions.find(tx => tx.id === txRequest.imported_transaction_id);
      if (!importedTx) throw new Error(`Imported transaction not found: ${txRequest.imported_transaction_id}`);
      
      return {
        date: importedTx.date,
        description: importedTx.description,
        spent: toFinancialAmount(importedTx.spent || '0.00'),
        received: toFinancialAmount(importedTx.received || '0.00'),
        selected_category_id: txRequest.selected_category_id,
        corresponding_category_id: txRequest.corresponding_category_id,
        payee_id: txRequest.payee_id || null,
        plaid_account_id: importedTx.plaid_account_id,
        plaid_account_name: importedTx.plaid_account_name,
        company_id: companyId,
        // Preserve split_data when moving transactions
        split_data: importedTx.split_data || null
      };
    });

    const { data: createdTransactions, error: insertError } = await supabase
      .from("transactions")
      .insert(transactionsToInsert)
      .select();

    if (insertError || !createdTransactions) {
      console.error("Error creating transactions:", insertError);
      return NextResponse.json({ 
        error: "Failed to create transactions" 
      }, { status: 500 });
    }

    // 4. Delete the imported transactions in bulk
    const { error: deleteError } = await supabase
      .from("imported_transactions")
      .delete()
      .in("id", importedTransactionIds)
      .eq("company_id", companyId);

    if (deleteError) {
      console.error("Error deleting imported transactions:", deleteError);
      // Don't return error here, as the transactions were already created
    }

    // 5. Generate journal entries for the new transactions
    const journalEntries = [];
    for (const tx of createdTransactions) {
      
      // Check if this is a split transaction
      if (tx.split_data && typeof tx.split_data === 'object' && tx.split_data.splits) {
        const splitData = tx.split_data as { splits: SplitItem[] };
        
        // For split transactions, create journal entries for each split item
        for (const split of splitData.splits) {
          const splitSpent = parseFloat(split.spent) || 0;
          const splitReceived = parseFloat(split.received) || 0;
          
          if (splitSpent > 0) {
            // Debit the split category, credit the corresponding account
            journalEntries.push({
              id: uuidv4(),
              transaction_id: tx.id,
              date: split.date,
              description: split.description || tx.description,
              chart_account_id: split.selected_category_id,
              debit: splitSpent,
              credit: 0,
              company_id: companyId,
            });
            journalEntries.push({
              id: uuidv4(),
              transaction_id: tx.id,
              date: split.date,
              description: split.description || tx.description,
              chart_account_id: tx.corresponding_category_id,
              debit: 0,
              credit: splitSpent,
              company_id: companyId,
            });
          }
          
          if (splitReceived > 0) {
            // Credit the split category, debit the corresponding account
            journalEntries.push({
              id: uuidv4(),
              transaction_id: tx.id,
              date: split.date,
              description: split.description || tx.description,
              chart_account_id: split.selected_category_id,
              debit: 0,
              credit: splitReceived,
              company_id: companyId,
            });
            journalEntries.push({
              id: uuidv4(),
              transaction_id: tx.id,
              date: split.date,
              description: split.description || tx.description,
              chart_account_id: tx.corresponding_category_id,
              debit: splitReceived,
              credit: 0,
              company_id: companyId,
            });
          }
        }
      } else {
        // Handle regular (non-split) transactions as before
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
    }

    // 6. Insert journal entries for the new transactions
    if (journalEntries.length > 0) {
      const { error: journalError } = await supabase
        .from('journal')
        .insert(journalEntries);
      
      if (journalError) {
        console.error("Error inserting journal entries:", journalError);
        // Don't fail the whole operation, just log the error
      }
    }

    // 7. Return success response
    return NextResponse.json({ 
      status: "success",
      processed: createdTransactions.length,
      transactions: createdTransactions,
      split_transactions: createdTransactions.filter(tx => tx.split_data).length
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to move transactions";
    console.error("Bulk transaction move failed:", errorMessage);
    return NextResponse.json({ 
      error: process.env.NODE_ENV === "development" 
        ? errorMessage 
        : "Failed to move transactions"
    }, { status: 500 });
  }
} 