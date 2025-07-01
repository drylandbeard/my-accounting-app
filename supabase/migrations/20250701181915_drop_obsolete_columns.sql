-- Drop obsolete columns from multiple tables
-- This migration removes the je_name column from manual_journal_entries
-- and the split_data column from imported_transactions, transactions, and journal tables

-- Remove je_name column from manual_journal_entries table
-- The description field is now used instead of je_name for consistency
ALTER TABLE manual_journal_entries 
DROP COLUMN IF EXISTS je_name;

-- Remove split_data column from imported_transactions table
-- This JSONB column is no longer used in the application
ALTER TABLE imported_transactions 
DROP COLUMN IF EXISTS split_data;

-- Remove split_data column from transactions table
-- This JSONB column is no longer used in the application
ALTER TABLE transactions 
DROP COLUMN IF EXISTS split_data;

-- Remove split_data column from journal table
-- This JSONB column is no longer used in the application
ALTER TABLE journal 
DROP COLUMN IF EXISTS split_data;
