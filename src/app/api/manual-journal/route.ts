import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface JournalEntryLine {
  description: string;
  categoryId: string;
  payeeId: string;
  debit: string;
  credit: string;
}

interface ManualJournalEntry {
  id: string;
  company_id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  chart_account_id: string;
  payee_id?: string;
  reference_number: string;
  je_name?: string;
  created_at: string;
  updated_at: string;
  chart_of_accounts: {
    id: string;
    name: string;
    type: string;
    subtype?: string;
  };
}

// GET - Fetch manual journal entries with pagination to handle more than 1000 rows
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id');
    const referenceNumber = url.searchParams.get('reference_number');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Fetch ALL manual journal entries with pagination
    let allEntries: ManualJournalEntry[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // Fetch all pages of data
    while (hasMore) {
      let query = supabase
        .from('manual_journal_entries')
        .select(`
          *,
          chart_of_accounts:chart_account_id (
            id,
            name,
            type,
            subtype
          )
        `)
        .eq('company_id', companyId)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      // If reference number is provided, filter by it
      if (referenceNumber) {
        query = query.eq('reference_number', referenceNumber);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching manual journal entries page:', error);
        return NextResponse.json({ error: 'Failed to fetch manual journal entries' }, { status: 500 });
      }

      if (data && data.length > 0) {
        allEntries = allEntries.concat(data);
        
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

    return NextResponse.json({ entries: allEntries });
  } catch (error) {
    console.error('Error in GET /api/manual-journal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create manual journal entries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, date, jeName, lines, referenceNumber } = body;

    if (!companyId || !date || !lines || !Array.isArray(lines)) {
      return NextResponse.json({ 
        error: 'Company ID, date, and lines are required' 
      }, { status: 400 });
    }

    // Validate that lines are balanced (total debits = total credits)
    const totalDebits = lines.reduce((sum: number, line: JournalEntryLine) => {
      return sum + (parseFloat(line.debit) || 0);
    }, 0);

    const totalCredits = lines.reduce((sum: number, line: JournalEntryLine) => {
      return sum + (parseFloat(line.credit) || 0);
    }, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return NextResponse.json({ 
        error: 'Journal entry must be balanced (total debits must equal total credits)' 
      }, { status: 400 });
    }

    // Generate a reference number if not provided
    const finalReferenceNumber = referenceNumber || `MJE-${Date.now()}`;

    // Insert all journal entry lines
    const journalEntries = lines
      .filter((line: JournalEntryLine) => line.categoryId && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0))
      .map((line: JournalEntryLine) => ({
        company_id: companyId,
        date,
        description: line.description || '',
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
        chart_account_id: line.categoryId,
        payee_id: line.payeeId || null,
        reference_number: finalReferenceNumber,
        je_name: jeName || null,
      }));

    if (journalEntries.length === 0) {
      return NextResponse.json({ 
        error: 'At least one valid journal entry line is required' 
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('manual_journal_entries')
      .insert(journalEntries)
      .select();

    if (error) {
      console.error('Error creating manual journal entries:', error);
      return NextResponse.json({ error: 'Failed to create manual journal entries' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      entries: data,
      referenceNumber: finalReferenceNumber
    });
  } catch (error) {
    console.error('Error in POST /api/manual-journal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 