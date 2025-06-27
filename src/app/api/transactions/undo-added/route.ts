import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

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

    // 3. Delete journal entries for these transactions in bulk
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

    // 4. Delete the transactions in bulk
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
    
    // 5. Insert back into imported_transactions in bulk
    const importedTransactionsToInsert = transactionsToUndo.map(tx => ({
      date: tx.date,
      description: tx.description,
      spent: tx.spent,
      received: tx.received,
      plaid_account_id: tx.plaid_account_id,
      plaid_account_name: tx.plaid_account_name,
      selected_category_id: tx.selected_category_id,
      payee_id: tx.payee_id,
      split_data: tx.split_data, // Preserve split_data when undoing transactions
      company_id: companyId
    }));

    const { error: insertError } = await supabase
      .from('imported_transactions')
      .insert(importedTransactionsToInsert);

    if (insertError) {
      console.error('Error inserting into imported_transactions:', insertError);
      return NextResponse.json({ 
        error: `Failed to insert into imported_transactions: ${insertError.message}` 
      }, { status: 500 });
    }

    // 6. Return success response
    return NextResponse.json({ 
      status: "success",
      processed: transactionsToUndo.length,
      message: `Successfully undid ${transactionsToUndo.length} transactions`
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