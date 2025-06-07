import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAdmin';
import { plaidClient } from '@/lib/plaid';

export async function POST(req: Request) {
  try {
    console.log('=== Step 3: Starting store plaid accounts ===');
    
    const { accessToken, itemId } = await req.json();
    console.log('Step 3: Received itemId:', itemId);
    console.log('Step 3: Access token:', accessToken ? 'Present' : 'Missing');
    
    if (!accessToken || !itemId) {
      console.error('Step 3: Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('=== Step 3: Fetching accounts from Plaid ===');
    
    // Get accounts from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });
    
    console.log('Step 3: Plaid accounts fetched:', accountsResponse.data.accounts.length);
    console.log('Step 3: Account details from Plaid:');
    accountsResponse.data.accounts.forEach((acc, index) => {
      console.log(`  Account ${index + 1}: ${acc.name} (${acc.account_id}) - ${acc.type}/${acc.subtype}`);
    });

    // Get institution info for better naming
    let institutionName = 'Unknown Institution';
    try {
      const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
      if (itemResponse.data.item.institution_id) {
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: itemResponse.data.item.institution_id,
          country_codes: ['US']
        });
        institutionName = institutionResponse.data.institution.name;
      }
    } catch (institutionError) {
      console.warn('Step 3: Could not fetch institution name:', institutionError);
    }

    console.log('Step 3: Institution name:', institutionName);

    const now = new Date().toISOString();
    
    // Transform accounts for database storage
    const accountsToInsert = accountsResponse.data.accounts.map((account) => {
      console.log(`Step 3: Processing account: ${account.name} (${account.account_id})`);
      
      const accountData = {
        id: crypto.randomUUID(), // Generate UUID for the account record
        plaid_account_id: account.account_id,
        name: account.name,
        type: account.type,
        starting_balance: account.balances.current || 0,
        current_balance: account.balances.current || 0,
        plaid_item_id: itemId, // This is CRITICAL for Step 4 to find accounts
        created_at: now,
        institution_name: institutionName,
        is_manual: false,
        subtype: account.subtype || null,
        account_number: account.mask ? `****${account.mask}` : null
      };
      
      console.log('Step 3: Account data prepared:', {
        name: accountData.name,
        plaid_account_id: accountData.plaid_account_id,
        plaid_item_id: accountData.plaid_item_id, // VERIFY THIS IS CORRECT
        type: accountData.type
      });
      
      return accountData;
    });

    console.log('Step 3: Accounts prepared for insert:', accountsToInsert.length);
    console.log('Step 3: All accounts will have plaid_item_id:', itemId);

    // Insert accounts with upsert to handle duplicates
    const { data: insertedAccounts, error: insertError } = await supabase
      .from('accounts')
      .upsert(accountsToInsert, { 
        onConflict: 'plaid_account_id',
        ignoreDuplicates: false 
      })
      .select();

    if (insertError) {
      console.error('Step 3: Database insert error:', insertError);
      return NextResponse.json({ 
        error: 'Failed to store accounts',
        details: insertError.message 
      }, { status: 500 });
    }

    console.log('Step 3: Accounts stored successfully:', insertedAccounts?.length || 0);
    console.log('Step 3: Inserted account IDs and item_ids:');
    insertedAccounts?.forEach((acc, index) => {
      console.log(`  ${index + 1}. ${acc.name} - plaid_item_id: ${acc.plaid_item_id}`);
    });

    // VERIFICATION: Let's check what's actually in the database now
    console.log('=== Step 3: VERIFICATION - Checking database ===');
    const { data: verifyAccounts, error: verifyError } = await supabase
      .from('accounts')
      .select('name, plaid_account_id, plaid_item_id')
      .eq('plaid_item_id', itemId);
      
    if (verifyError) {
      console.error('Step 3: Verification query failed:', verifyError);
    } else {
      console.log('Step 3: VERIFICATION - Accounts in database with this item_id:', verifyAccounts?.length || 0);
      verifyAccounts?.forEach((acc, index) => {
        console.log(`  VERIFY ${index + 1}: ${acc.name} - item_id: ${acc.plaid_item_id}`);
      });
    }

    return NextResponse.json({ 
      success: true, 
      data: insertedAccounts,
      count: insertedAccounts?.length || 0,
      message: `Successfully stored ${insertedAccounts?.length || 0} accounts`,
      itemId: itemId, // Return this for verification
      verification: verifyAccounts
    });

  } catch (error: any) {
    console.error('=== Step 3 Critical Error ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    return NextResponse.json({ 
      error: error.message || 'Unknown error occurred',
      step: 'store_accounts'
    }, { status: 500 });
  }
}