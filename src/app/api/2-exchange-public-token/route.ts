import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    console.log('=== Step 2: Starting exchange public token ===');
    
    // Use a proper UUID for development (replace with real auth later)
    const user = { id: '00000000-0000-0000-0000-000000000000' };

    // Get the public_token and metadata from the request body
    const { public_token, institution_name } = await req.json();
    
    console.log('Step 2: Received public_token:', public_token ? 'Present' : 'Missing');
    console.log('Step 2: Institution name:', institution_name);

    if (!public_token) {
      console.error('Step 2: Missing public_token');
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 });
    }

    console.log('Step 2: Exchanging public token...');

    // 1. Exchange public_token for access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    console.log('Step 2: Got access_token and item_id:', {
      item_id,
      access_token: access_token ? 'EXISTS' : 'MISSING'
    });

    if (!access_token || !item_id) {
      console.error('Step 2: Invalid response from Plaid');
      return NextResponse.json({ error: 'Invalid response from Plaid' }, { status: 500 });
    }

    // Generate a proper UUID for the record
    const recordId = crypto.randomUUID();
    const currentTimestamp = new Date().toISOString();

    console.log('Step 2: Preparing database insert with:', {
      recordId,
      userId: user.id,
      itemId: item_id,
      institutionName: institution_name || 'Unknown',
      timestamp: currentTimestamp
    });

    // 2. Save to plaid_items table
    const { data: insertedData, error: insertError } = await supabase
      .from('plaid_items')
      .insert({
        id: recordId,
        user_id: user.id, // This is a proper UUID
        item_id,
        access_token,
        institution_name: institution_name || 'Unknown Institution',
        created_at: currentTimestamp
      })
      .select();

    if (insertError) {
      console.error('Step 2: Error saving to plaid_items:', insertError);
      return NextResponse.json({ 
        error: 'Failed to save Plaid connection',
        details: insertError.message,
        code: insertError.code
      }, { status: 500 });
    }

    console.log('Step 2: Successfully saved to database:', insertedData);

    // 3. Return the access_token and item_id to the frontend
    const successResponse = {
      access_token,
      item_id,
      record_id: recordId,
      message: 'Public token exchanged and saved successfully'
    };

    console.log('Step 2: Returning success response');
    return NextResponse.json(successResponse);

  } catch (err: any) {
    console.error('=== Step 2: Critical Error ===');
    console.error('Error type:', typeof err);
    console.error('Error message:', err.message);
    
    if (err.response?.data) {
      console.error('Plaid API Error:', err.response.data);
    }
    
    return NextResponse.json({ 
      error: err.response?.data?.error_message || err.message || String(err),
      step: 'exchange_public_token'
    }, { status: 500 });
  }
}