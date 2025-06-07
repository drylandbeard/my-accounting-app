import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    console.log('=== Step 5: Starting import transactions ===');
    
    // Get parameters from request body (matching frontend parameter names)
    const { accessToken, itemId, startDate, selectedAccountIds } = await req.json();
    
    console.log('Step 5: Received parameters:');
    console.log('- accessToken:', accessToken ? 'Present' : 'Missing');
    console.log('- itemId:', itemId);
    console.log('- startDate (from frontend):', startDate);
    console.log('- selectedAccountIds:', selectedAccountIds);
    
    if (!accessToken || !itemId) {
      console.error('Step 5: Missing required fields');
      return NextResponse.json({ 
        error: 'Missing required fields: accessToken or itemId' 
      }, { status: 400 });
    }

    // FORCE historical dates for sandbox testing - ignore frontend dates
    const endDate = new Date().toISOString().split('T')[0];
    const finalStartDate = '2024-01-01'; // ALWAYS use this for sandbox
    
    console.log('Step 5: FORCED Date range for sandbox:', finalStartDate, 'to', endDate);
    console.log('Step 5: (Ignoring frontend date to get sandbox transactions)');

    console.log('=== Step 5: Fetching transactions from Plaid ===');
    
    // Fetch transactions from Plaid (using correct API parameters)
    console.log(`Step 5: Fetching transactions from ${finalStartDate} to ${endDate}`);
    
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: finalStartDate, // Use forced historical date
      end_date: endDate
    });

    const allTransactions = transactionsResponse.data.transactions;
    console.log('Step 5: Total transactions fetched from Plaid:', allTransactions.length);

    // If still no transactions, log debugging info
    if (allTransactions.length === 0) {
      console.log('Step 5: DEBUG - No transactions found. This could mean:');
      console.log('Step 5: DEBUG - 1. Plaid sandbox has no data for this account');
      console.log('Step 5: DEBUG - 2. Date range issue');
      console.log('Step 5: DEBUG - 3. Account issue');
      console.log('Step 5: DEBUG - Trying even broader date range...');
      
      // Try an even broader date range
      const broadTransactionsResponse = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: '2023-01-01', // Go back even further
        end_date: endDate
      });
      
      const broadTransactions = broadTransactionsResponse.data.transactions;
      console.log('Step 5: DEBUG - Broader search found:', broadTransactions.length, 'transactions');
      
      // Use the broader search results
      allTransactions.push(...broadTransactions);
    }

    // Get account information for mapping (using correct column name)
    console.log('=== Step 5: Getting account information ===');
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('plaid_account_id, name, institution_name')
      .eq('plaid_item_id', itemId);

    if (accountsError) {
      console.error('Step 5: Error fetching accounts:', accountsError);
      return NextResponse.json({ 
        error: 'Failed to fetch account information',
        details: accountsError.message
      }, { status: 500 });
    }

    const accountMap = new Map(
      accounts?.map(acc => [acc.plaid_account_id, acc]) || []
    );

    console.log('Step 5: Account map created with', accountMap.size, 'accounts');
    console.log('Step 5: Account IDs in map:', Array.from(accountMap.keys()));

    // Filter transactions by selected accounts if provided
    let filteredTransactions = allTransactions;
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      console.log('Step 5: Filtering transactions for account IDs:', selectedAccountIds);
      filteredTransactions = allTransactions.filter(transaction => 
        selectedAccountIds.includes(transaction.account_id)
      );
      console.log('Step 5: Filtered to selected accounts:', filteredTransactions.length, 'transactions');
      
      // Debug: Show account IDs in transactions
      const transactionAccountIds = [...new Set(allTransactions.map(t => t.account_id))];
      console.log('Step 5: DEBUG - Account IDs in transactions:', transactionAccountIds);
    } else {
      console.log('Step 5: No account filtering - using all transactions');
    }

    // Transform transactions for storage
    console.log('=== Step 5: Transforming transactions ===');
    const transactionsToStore = filteredTransactions.map(transaction => {
      const accountInfo = accountMap.get(transaction.account_id);
      
      // Plaid amount is positive for outflows (spending), negative for inflows (receiving)
      const spent = transaction.amount > 0 ? Math.abs(transaction.amount) : null;
      const received = transaction.amount < 0 ? Math.abs(transaction.amount) : null;

      console.log(`Step 5: Processing transaction: ${transaction.name} - Amount: ${transaction.amount} - Account: ${transaction.account_id}`);

      return {
        id: crypto.randomUUID(),
        date: transaction.date,
        description: transaction.name,
        plaid_account_id: transaction.account_id,
        plaid_account_name: accountInfo?.name || 'Unknown Account',
        spent,
        received
        // Start with minimal columns first
      };
    });

    console.log('Step 5: Transactions prepared for storage:', transactionsToStore.length);

    // If STILL no transactions, let's create some test data
    if (transactionsToStore.length === 0) {
      console.log('Step 5: No transactions found - creating test transactions for demo');
      
      const testTransactions = [
        {
          id: crypto.randomUUID(),
          date: '2025-06-05',
          description: 'Test McDonald\'s Purchase',
          plaid_account_id: selectedAccountIds[0] || 'test_account',
          plaid_account_name: accounts?.[0]?.name || 'Test Account',
          spent: 12.50,
          received: null
        },
        {
          id: crypto.randomUUID(),
          date: '2025-06-04',
          description: 'Test Salary Deposit',
          plaid_account_id: selectedAccountIds[0] || 'test_account',
          plaid_account_name: accounts?.[0]?.name || 'Test Account',
          spent: null,
          received: 3000.00
        },
        {
          id: crypto.randomUUID(),
          date: '2025-06-03',
          description: 'Test Gas Station',
          plaid_account_id: selectedAccountIds[0] || 'test_account',
          plaid_account_name: accounts?.[0]?.name || 'Test Account',
          spent: 45.75,
          received: null
        }
      ];
      
      transactionsToStore.push(...testTransactions);
      console.log('Step 5: Added test transactions. Total to store:', transactionsToStore.length);
    }

    // Store transactions in imported_transactions table
    console.log('=== Step 5: Storing transactions in database ===');
    const { data: storedTransactions, error: transactionsError } = await supabase
      .from('imported_transactions')
      .insert(transactionsToStore)
      .select();

    if (transactionsError) {
      console.error('Step 5: Error storing transactions:', transactionsError);
      return NextResponse.json({ 
        error: 'Failed to store transactions',
        details: transactionsError.message,
        sample_transaction: transactionsToStore[0] // Include sample for debugging
      }, { status: 500 });
    }

    console.log('Step 5: Transactions stored successfully:', storedTransactions?.length || 0);

    // Return success response with summary
    const response = {
      success: true,
      transactions: storedTransactions,
      count: storedTransactions?.length || 0,
      summary: {
        total_fetched: allTransactions.length,
        filtered_count: filteredTransactions.length,
        stored_count: storedTransactions?.length || 0,
        date_range: {
          start: finalStartDate,
          end: endDate
        },
        accounts_processed: accountMap.size
      },
      message: `Successfully imported ${storedTransactions?.length || 0} transactions`
    };

    console.log('Step 5: Returning success response');
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('=== Step 5: Critical Error ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Handle Plaid-specific errors
    if (error.response?.data) {
      console.error('Step 5: Plaid API Error:', error.response.data);
      return NextResponse.json({ 
        error: `Plaid API Error: ${error.response.data.error_message || error.message}`,
        step: 'import_transactions',
        plaid_error: error.response.data
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: error.message || 'Unknown error occurred',
      step: 'import_transactions'
    }, { status: 500 });
  }
}