-- Re-add je_name column to manual_journal_entries table
-- This column is used to store the journal entry name (separate from individual line descriptions)

ALTER TABLE manual_journal_entries 
ADD COLUMN je_name TEXT;

-- Add index for better performance when searching by je_name
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_je_name ON manual_journal_entries (je_name);

-- Add comment to document the purpose of this column
COMMENT ON COLUMN manual_journal_entries.je_name IS 'Name/title of the journal entry, distinct from individual line descriptions'; 