import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface JournalEntryLine {
  id?: string;
  description: string;
  categoryId: string;
  payeeId: string;
  debit: string;
  credit: string;
}

// PUT - Update manual journal entries by reference number
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, referenceNumber, date, lines } = body;

    if (!companyId || !referenceNumber || !date || !lines || !Array.isArray(lines)) {
      return NextResponse.json({ 
        error: 'Company ID, reference number, date, and lines are required' 
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

    // First, delete existing entries for this reference number
    const { error: deleteError } = await supabase
      .from('manual_journal_entries')
      .delete()
      .eq('company_id', companyId)
      .eq('reference_number', referenceNumber);

    if (deleteError) {
      console.error('Error deleting existing manual journal entries:', deleteError);
      return NextResponse.json({ error: 'Failed to update manual journal entries' }, { status: 500 });
    }

    // Then insert the updated entries
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
        reference_number: referenceNumber
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
      console.error('Error updating manual journal entries:', error);
      return NextResponse.json({ error: 'Failed to update manual journal entries' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      entries: data
    });
  } catch (error) {
    console.error('Error in PUT /api/manual-journal/update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 