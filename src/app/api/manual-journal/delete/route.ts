import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DELETE - Delete manual journal entries by reference number
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, referenceNumber } = body;

    if (!companyId || !referenceNumber) {
      return NextResponse.json({ 
        error: 'Company ID and reference number are required' 
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('manual_journal_entries')
      .delete()
      .eq('company_id', companyId)
      .eq('reference_number', referenceNumber);

    if (error) {
      console.error('Error deleting manual journal entries:', error);
      return NextResponse.json({ error: 'Failed to delete manual journal entries' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/manual-journal/delete:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 