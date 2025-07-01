import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface JournalEntryLine {
  description: string;
  categoryId: string;
  payeeId: string;
  debit: string;
  credit: string;
}

// GET - Fetch manual journal entries
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const { data: entries, error } = await supabase
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
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching manual journal entries:', error);
      return NextResponse.json({ error: 'Failed to fetch manual journal entries' }, { status: 500 });
    }

    return NextResponse.json({ entries: entries || [] });
  } catch (error) {
    console.error('Error in GET /api/manual-journal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create manual journal entries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, date, lines, referenceNumber } = body;

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