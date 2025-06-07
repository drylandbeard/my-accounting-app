import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    console.log('=== Step 4: Starting store accounts as categories ===');
    
    const { accessToken, itemId } = await req.json();
    
    console.log('Step 4: Received parameters:');
    console.log('- accessToken:', accessToken ? 'Present' : 'Missing');
    console.log('- itemId:', itemId);
    
    if (!accessToken || !itemId) {
      console.error('Step 4: Missing required fields');
      return NextResponse.json({ 
        error: 'Missing required fields: accessToken or itemId' 
      }, { status: 400 });
    }

    console.log('=== Step 4: Fetching accounts from database ===');
    
    // Get the accounts we stored in Step 3
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('plaid_item_id', itemId);

    if (accountsError) {
      console.error('Step 4: Error fetching accounts:', accountsError);
      return NextResponse.json({ 
        error: 'Failed to fetch accounts from database',
        details: accountsError.message
      }, { status: 500 });
    }

    console.log('Step 4: Found accounts:', accounts?.length || 0);

    if (!accounts || accounts.length === 0) {
      console.error('Step 4: No accounts found for itemId:', itemId);
      return NextResponse.json({ 
        error: 'No accounts found. Please run Step 3 first.',
        itemId: itemId
      }, { status: 400 });
    }

    console.log('=== Step 4: Transforming accounts to chart entries ===');
    
    // Transform accounts to chart entries
    const chartAccounts = accounts.map(account => {
      console.log(`Processing account: ${account.name}`);
      
      return {
        id: crypto.randomUUID(),
        name: account.name,
        type: account.type === 'credit' || account.type === 'loan' ? 'Liability' : 'Asset',
        subtype: account.subtype,
        plaid_account_id: account.plaid_account_id,
        parent_id: null
      };
    });

    console.log('Step 4: Chart accounts prepared:', chartAccounts.length);

    // Store in chart_of_accounts with simple insert (NO UPSERT)
    const { data: storedChartAccounts, error: chartError } = await supabase
      .from('chart_of_accounts')
      .insert(chartAccounts)
      .select();

    if (chartError) {
      console.error('Step 4: Error storing chart of accounts:', chartError);
      return NextResponse.json({ 
        error: 'Failed to store chart of accounts',
        details: chartError.message
      }, { status: 500 });
    }

    console.log('Step 4: Chart accounts stored successfully:', storedChartAccounts?.length || 0);

    // Return success response
    const response = {
      success: true,
      chart_accounts: storedChartAccounts,
      count: storedChartAccounts?.length || 0,
      message: `Successfully created ${storedChartAccounts?.length || 0} chart of account entries`
    };

    console.log('Step 4: Returning success response');
    return NextResponse.json(response);

  } catch (err: any) {
    console.error('=== Step 4: Critical Error ===');
    console.error('Error:', err.message);
    
    return NextResponse.json({ 
      error: err.message || 'Failed to create chart of accounts',
      step: 'store_categories'
    }, { status: 500 });
  }
}