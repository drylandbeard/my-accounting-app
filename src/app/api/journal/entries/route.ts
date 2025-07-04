import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'

interface JournalEntry {
  id: string;
  transaction_id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  chart_account_id: string;
  company_id: string;
  transactions: {
    payee_id?: string;
    corresponding_category_id?: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transaction_id');

    // Fetch ALL journal entries with pagination
    let allEntries: JournalEntry[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // Fetch all pages of data
    while (hasMore) {
      let query = supabase
        .from('journal')
        .select(`
          *,
          transactions!inner(payee_id, corresponding_category_id)
        `)
        .eq('company_id', companyId)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('date', { ascending: false });

      // If transaction_id is provided, filter by it
      if (transactionId) {
        query = query.eq('transaction_id', transactionId);
      }

      const { data, error } = await query;
        
      if (error) {
        console.error('Error fetching journal entries page:', error);
        return NextResponse.json(
          { error: 'Failed to fetch journal entries: ' + error.message },
          { status: 500 }
        );
      }

      if (data && data.length > 0) {
        allEntries = allEntries.concat(data as JournalEntry[]);
        
        // If we got less than pageSize, we've reached the end
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return NextResponse.json(
      { entries: allEntries },
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