import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { accessToken, itemId } = await req.json();
    if (!accessToken || !itemId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const item = await plaid.itemGet({ access_token: accessToken });
    const institutionName = item.data.item.institution_id;

    const now = new Date();
    const tx = await plaid.transactionsGet({
      access_token: accessToken,
      start_date: new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10),
      end_date: now.toISOString().slice(0, 10),
    });

    const accountsToInsert = tx.data.accounts.map((a) => ({
      plaid_account_id: a.account_id,
      starting_balance: a.balances.current || 0,
      current_balance: a.balances.current || 0,
      is_manual: false,
      name: a.name,
      institution_name: institutionName,
      account_number: a.mask ? `****${a.mask}` : null,
      type: a.type,
      subtype: a.subtype,
      plaid_item_id: itemId,
      created_at: now.toISOString(),
    }));

    const { data, error } = await supabase.from('accounts').insert(accountsToInsert).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
