import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    // 1. Get parameters from request body
    const { imported_transaction_id, selected_category_id, corresponding_category_id } = await req.json();
    
    if (!imported_transaction_id || !selected_category_id || !corresponding_category_id) {
      return NextResponse.json({ 
        error: 'Missing required fields: imported_transaction_id, selected_category_id, or corresponding_category_id' 
      }, { status: 400 });
    }

    // 2. Get the imported transaction
    const { data: importedTransaction, error: fetchError } = await supabase
      .from('imported_transactions')
      .select('*')
      .eq('id', imported_transaction_id)
      .single();

    if (fetchError || !importedTransaction) {
      console.error('Error fetching imported transaction:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to fetch imported transaction' 
      }, { status: 500 });
    }

    // 3. Create transaction record
    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert([{
        date: importedTransaction.date,
        description: importedTransaction.description,
        spent: importedTransaction.spent,
        received: importedTransaction.received,
        selected_category_id,
        corresponding_category_id,
        plaid_account_id: importedTransaction.plaid_account_id,
        plaid_account_name: importedTransaction.plaid_account_name
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating transaction:', insertError);
      return NextResponse.json({ 
        error: 'Failed to create transaction' 
      }, { status: 500 });
    }

    // 4. Delete the imported transaction
    const { error: deleteError } = await supabase
      .from('imported_transactions')
      .delete()
      .eq('id', imported_transaction_id);

    if (deleteError) {
      console.error('Error deleting imported transaction:', deleteError);
      // Don't return error here, as the transaction was already created
      // Just log the error for monitoring
    }

    // 5. Return success response
    return NextResponse.json({ 
      status: 'success',
      transaction
    });

  } catch (err: any) {
    console.error('Transaction move failed:', err);
    return NextResponse.json({ 
      error: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'Failed to move transaction'
    }, { status: 500 });
  }
} 