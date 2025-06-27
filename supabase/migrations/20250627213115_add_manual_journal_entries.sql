-- Create manual_journal_entries table for user-created journal entries
CREATE TABLE manual_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT,
  debit NUMERIC(19,4) DEFAULT 0,
  credit NUMERIC(19,4) DEFAULT 0,
  chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  reference_number TEXT, -- Optional reference number for grouping related entries
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_manual_journal_entries_company_id ON manual_journal_entries(company_id);
CREATE INDEX idx_manual_journal_entries_date ON manual_journal_entries(date);
CREATE INDEX idx_manual_journal_entries_chart_account_id ON manual_journal_entries(chart_account_id);
CREATE INDEX idx_manual_journal_entries_reference_number ON manual_journal_entries(reference_number);

-- Add RLS policies
ALTER TABLE manual_journal_entries ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to manage manual journal entries for their companies
CREATE POLICY "Users can manage manual journal entries for their companies" ON manual_journal_entries
  FOR ALL
  USING (
    company_id IN (
      SELECT cu.company_id 
      FROM company_users cu 
      WHERE cu.user_id = auth.uid() 
        AND cu.is_active = true
    )
  );

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_manual_journal_entries_updated_at 
  BEFORE UPDATE ON manual_journal_entries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 