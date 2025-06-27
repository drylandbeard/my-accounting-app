-- Add je_name column to manual_journal_entries table
ALTER TABLE manual_journal_entries 
ADD COLUMN je_name TEXT;

-- Add index for better performance when searching by je_name
CREATE INDEX idx_manual_journal_entries_je_name ON manual_journal_entries (je_name); 