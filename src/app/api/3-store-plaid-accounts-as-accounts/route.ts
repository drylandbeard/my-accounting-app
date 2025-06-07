import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAdmin';
import { plaidClient } from '@/lib/plaid';
import { CountryCode } from 'plaid';

/**
 * Step 3: Store Plaid accounts in our accounts table
 * This creates account records that will be used in Steps 4 and 5
 */
export async function POST(req: Request) {
  try {
    const { accessToken, itemId } = await req.json();
    
    if (!accessToken || !itemId) {
      return NextResponse.json({ 
        error: 'Missing required fields: accessToken and itemId' 
      }, { status: 400 });
    }

    // Fetch accounts from Plaid
    const plaidAccountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });
    
    const plaidAccounts = plaidAccountsResponse.data.accounts;
    console.log(`📦 Fetched ${plaidAccounts.length} accounts from Plaid`);

    // Get institution name for better account labeling
    let institutionName = 'Unknown Institution';
    try {
      const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
      if (itemResponse.data.item.institution_id) {
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: itemResponse.data.item.institution_id,
          country_codes: ['US' as CountryCode]
        });
        institutionName = institutionResponse.data.institution.name;
      }
    } catch {
      console.warn('Could not fetch institution name, using default');
    }

    // Transform Plaid accounts to our database format
    const accountRecords = plaidAccounts.map((plaidAccount) => ({
      id: crypto.randomUUID(),
      plaid_account_id: plaidAccount.account_id,
      name: plaidAccount.name, // Database column is 'name', not 'plaid_account_name'
      type: plaidAccount.type,
      subtype: plaidAccount.subtype || null,
      starting_balance: plaidAccount.balances.current || 0,
      current_balance: plaidAccount.balances.current || 0,
      plaid_item_id: itemId,
      institution_name: institutionName,
      account_number: plaidAccount.mask ? `****${plaidAccount.mask}` : null,
      is_manual: false,
      created_at: new Date().toISOString(),
    }));

    // Store accounts in database (upsert to handle duplicates)
    const { data: storedAccounts, error: storageError } = await supabase
      .from('accounts')
      .upsert(accountRecords, { 
        onConflict: 'plaid_account_id',
        ignoreDuplicates: false 
      })
      .select();

    if (storageError) {
      console.error('Failed to store accounts:', storageError);
      return NextResponse.json({ 
        error: 'Failed to store accounts in database',
        details: storageError.message 
      }, { status: 500 });
    }

    console.log(`✅ Stored ${storedAccounts?.length || 0} accounts successfully`);

    return NextResponse.json({ 
      success: true, 
      data: storedAccounts,
      count: storedAccounts?.length || 0,
      message: `Successfully stored ${storedAccounts?.length || 0} accounts`
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('❌ Account storage failed:', errorMessage);
    
    return NextResponse.json({ 
      error: errorMessage,
      step: 'store_accounts'
    }, { status: 500 });
  }
}
