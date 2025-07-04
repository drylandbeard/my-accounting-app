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

interface ImportedTransactionSplit {
  id: string;
  imported_transaction_id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  chart_account_id: string;
  payee_id?: string;
  company_id: string;
}

// Split functionality removed - transactions are handled via journal entries

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

    // Get split data first to determine which transactions have splits
    const { data: splitData, error: splitError } = await supabase
      .from('imported_transactions_split')
      .select('*')
      .in('imported_transaction_id', importedTransactionIds)
      .eq('company_id', companyId);

    if (splitError) {
      console.error("Error fetching split data:", splitError);
      // Continue without split data
    }

    // Group split data by imported transaction ID
    const splitMap = new Map<string, ImportedTransactionSplit[]>();
    if (splitData) {
      splitData.forEach(split => {
        const existing = splitMap.get(split.imported_transaction_id) || [];
        existing.push(split);
        splitMap.set(split.imported_transaction_id, existing);
      });
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

    // 5. Split data already fetched and grouped above

    // 6. Generate journal entries for the new transactions
    const journalEntries = [];
    for (const tx of createdTransactions) {
      // Find the corresponding imported transaction
      const importedTx = importedTransactions.find(imp => 
        imp.plaid_account_id === tx.plaid_account_id && 
        imp.date === tx.date && 
        imp.description === tx.description
      );
      
      if (!importedTx) {
        console.error(`Could not find imported transaction for ${tx.id}`);
        continue;
      }

      const splits = splitMap.get(importedTx.id);
      
      if (splits && splits.length > 0) {
        // Transaction has split data - transfer it to journal entries
        for (const split of splits) {
          journalEntries.push({
            id: uuidv4(),
            transaction_id: tx.id,
            date: split.date,
            description: split.description,
            chart_account_id: split.chart_account_id,
            debit: split.debit || 0,
            credit: split.credit || 0,
            company_id: companyId,
          });
        }
      } else {
        // No split data - create basic journal entries
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

    // 7. Insert journal entries for the new transactions
    if (journalEntries.length > 0) {
      const { error: journalError } = await supabase
        .from('journal')
        .insert(journalEntries);
      
      if (journalError) {
        console.error("Error inserting journal entries:", journalError);
        // Don't fail the whole operation, just log the error
      }
    }

    // 8. Delete split data for moved transactions
    if (splitData && splitData.length > 0) {
      const { error: deleteSplitError } = await supabase
        .from('imported_transactions_split')
        .delete()
        .in('imported_transaction_id', importedTransactionIds)
        .eq('company_id', companyId);

      if (deleteSplitError) {
        console.error("Error deleting split data:", deleteSplitError);
        // Don't fail the whole operation, just log the error
      }
    }

    // 9. Return success response
    return NextResponse.json({ 
      status: "success",
      processed: createdTransactions.length,
      transactions: createdTransactions
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