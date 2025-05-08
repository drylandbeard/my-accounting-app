-- Add is_manual column to accounts table
ALTER TABLE accounts ADD COLUMN is_manual BOOLEAN DEFAULT FALSE;

-- Update existing accounts to have is_manual = false
UPDATE accounts SET is_manual = FALSE WHERE is_manual IS NULL; 