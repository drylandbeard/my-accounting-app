-- Add split_data column to journal table to track split transactions
ALTER TABLE journal ADD COLUMN split_data jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN journal.split_data IS 'JSON data containing split transaction details when this journal entry represents a split transaction'; 