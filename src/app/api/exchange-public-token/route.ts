import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    // Get the public_token and (optionally) institution_name and user_id from the request body
    const { public_token, institution_name, user_id } = await req.json();

    // 1. Exchange public_token for access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // 2. Save to plaid_items table
    await supabase.from('plaid_items').insert({
      // id: crypto.randomUUID(), // Uncomment if you want to generate the UUID in code, otherwise let Supabase handle it
      user_id, // Omit or provide as needed
      item_id,
      access_token,
      institution_name,
      created_at: new Date().toISOString()
    });

    // 3. Return the access_token and item_id to the frontend (if needed)
    return NextResponse.json({ access_token, item_id });
  } catch (err: any) {
    console.error('Plaid exchange error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
