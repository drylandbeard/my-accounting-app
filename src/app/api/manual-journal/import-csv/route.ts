import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface CSVJournalEntry {
  id: string;
  date: string;
  description: string;
  debit: string;
  credit: string;
  payee_id?: string;
  chart_account_id?: string;
}

interface ImportJournalEntryRequest {
  companyId: string;
  date: string;
  jeName: string;
  entries: CSVJournalEntry[];
}

// POST - Import manual journal entries from CSV
export async function POST(request: NextRequest) {
  try {
    const body: ImportJournalEntryRequest = await request.json();
    const { companyId, date, jeName, entries } = body;

    if (!companyId || !date || !entries || !Array.isArray(entries)) {
      return NextResponse.json({ 
        error: 'Company ID, date, and entries are required' 
      }, { status: 400 });
    }

    // Validate that entries are balanced (total debits = total credits)
    const totalDebits = entries.reduce((sum, entry) => {
      return sum + (parseFloat(entry.debit) || 0);
    }, 0);

    const totalCredits = entries.reduce((sum, entry) => {
      return sum + (parseFloat(entry.credit) || 0);
    }, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return NextResponse.json({ 
        error: 'Journal entries must be balanced (total debits must equal total credits)' 
      }, { status: 400 });
    }

    // Generate a reference number
    const referenceNumber = `CSV-${Date.now()}`;

    // Insert all journal entry lines
    const journalEntries = entries
      .filter(entry => entry.chart_account_id && (parseFloat(entry.debit) > 0 || parseFloat(entry.credit) > 0))
      .map(entry => ({
        company_id: companyId,
        date,
        description: entry.description || '',
        debit: parseFloat(entry.debit) || 0,
        credit: parseFloat(entry.credit) || 0,
        chart_account_id: entry.chart_account_id,
        payee_id: entry.payee_id || null,
        reference_number: referenceNumber,
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
      referenceNumber
    });
  } catch (error) {
    console.error('Error in POST /api/manual-journal/import-csv:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
