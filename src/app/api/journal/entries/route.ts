import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .eq('company_id', companyId)
      .order('date', { ascending: false });

    const entries = []
    if (transactions) {
      // Group transactions by description and date to form journal entries
      const groupedEntries = transactions.reduce((acc, tx) => {
        const key = `${tx.date}_${tx.description}`;
        if (!acc[key]) {
          acc[key] = {
            id: tx.id,
            date: tx.date,
            description: tx.description,
            transactions: []
          };
        }
        
        acc[key].transactions.push({
          account_id: tx.selected_category_id || tx.corresponding_category_id,
          account_name: 'Unknown Account', // Will be populated by caller if needed
          amount: typeof tx.amount === 'number' ? tx.amount : (tx.spent ?? tx.received ?? 0),
          type: tx.selected_category_id ? 'debit' : 'credit'
        });
        
        return acc;
      }, {});

      entries.push(...Object.values(groupedEntries));
    }

    return NextResponse.json(
      { entries },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error fetching journal entries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch journal entries' },
      { status: 500 }
    )
  }
} 