import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    // TEMP: Use a dummy user ID for development (replace with real auth later)
    const user = { id: '00000000-0000-0000-0000-000000000000' };

    // Get the public_token and metadata from the request body
    const { public_token, institution_name } = await req.json();

    if (!public_token) {
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 });
    }

    // 1. Exchange public_token for access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    if (!access_token || !item_id) {
      return NextResponse.json({ error: 'Invalid response from Plaid' }, { status: 500 });
    }

    // 2. Save to plaid_items table
    const { error: insertError } = await supabase.from('plaid_items').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      item_id,
      access_token,
      institution_name,
      created_at: new Date().toISOString()
    });

    if (insertError) {
      console.error('Error inserting into plaid_items:', insertError);
      return NextResponse.json({ error: 'Failed to save Plaid connection' }, { status: 500 });
    }

    // 3. Return the access_token and item_id to the frontend
    return NextResponse.json({ access_token, item_id });
  } catch (err: any) {
    console.error('Plaid exchange error:', err);
    return NextResponse.json({ 
      error: err.response?.data?.error_message || err.message || String(err) 
    }, { status: 500 });
  }
}
