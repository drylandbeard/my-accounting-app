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

    // Fetch journal entries with transaction data including split_data
    const { data: journalEntries, error } = await supabase
      .from('journal')
      .select(`
        *,
        transactions!inner(payee_id, split_data)
      `)
      .eq('company_id', companyId)
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