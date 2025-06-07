import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Setup Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Setup Plaid
const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
}));

export async function POST(req: Request) {
  try {
    const { public_token, institution_name, user_id } = await req.json();

    console.log('Step 2: Exchanging public token...');

    // 1. Exchange public_token for access_token and item_id
    const response = await plaid.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    console.log('Step 2: Got access_token and item_id:', { item_id, access_token: 'EXISTS' });

    // Use a proper UUID as default instead of 'default-user'
    const defaultUserId = '00000000-0000-0000-0000-000000000000';
    const finalUserId = user_id || defaultUserId;

    console.log('Step 2: Using user_id:', finalUserId);

    // 2. Save to plaid_items table WITH ERROR CHECKING
    const { data, error } = await supabase.from('plaid_items').insert({
      id: crypto.randomUUID(), // Generate a unique ID for this record
      user_id: finalUserId, // Use proper UUID format
      item_id,
      access_token,
      institution_name: institution_name || null,
      created_at: new Date().toISOString()
    }).select();

    // CHECK FOR ERRORS!
    if (error) {
      console.error('Step 2: Error saving to plaid_items:', error);
      return NextResponse.json({ 
        error: `Failed to save to plaid_items: ${error.message}`,
        details: error
      }, { status: 500 });
    }

    console.log('Step 2: Successfully saved to plaid_items:', data);

    // 3. Return the access_token and item_id to the frontend
    return NextResponse.json({ access_token, item_id });

  } catch (err: any) {
    console.error('Step 2: Plaid exchange error:', err);
    return NextResponse.json({ 
      error: err.message || String(err),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}