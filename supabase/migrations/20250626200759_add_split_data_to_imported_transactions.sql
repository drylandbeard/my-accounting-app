-- Add split_data column to imported_transactions table for split transaction support
ALTER TABLE imported_transactions 
ADD COLUMN split_data jsonb;

-- Add split_data column to transactions table for split transaction support
ALTER TABLE transactions 
ADD COLUMN split_data jsonb;

-- Add comments to explain the columns
COMMENT ON COLUMN imported_transactions.split_data IS 'JSON data containing split transaction information including original description and split items';
COMMENT ON COLUMN transactions.split_data IS 'JSON data containing split transaction information including original description and split items';

-- Add indexes on split_data for better query performance when searching for split transactions
CREATE INDEX idx_imported_transactions_split_data ON imported_transactions USING GIN (split_data);
CREATE INDEX idx_transactions_split_data ON transactions USING GIN (split_data); 