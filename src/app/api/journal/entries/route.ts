import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateCompanyContext } from '@/lib/auth-utils'

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

    let query = supabase
      .from('journal')
      .select(`
        *,
        transactions!inner(payee_id, split_data, corresponding_category_id)
      `)
      .eq('company_id', companyId);

    // If transaction_id is provided, filter by it
    if (transactionId) {
      query = query.eq('transaction_id', transactionId);
    }

    const { data: journalEntries, error } = await query
      .order('date', { ascending: false });
        
    if (error) {
      console.error('Error fetching journal entries:', error);
      return NextResponse.json(
        { error: 'Failed to fetch journal entries: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { entries: journalEntries || [] },
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