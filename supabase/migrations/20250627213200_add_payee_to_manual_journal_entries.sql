-- Add payee_id column to manual_journal_entries table
ALTER TABLE manual_journal_entries 
ADD COLUMN payee_id UUID REFERENCES payees(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_manual_journal_entries_payee_id ON manual_journal_entries(payee_id); 