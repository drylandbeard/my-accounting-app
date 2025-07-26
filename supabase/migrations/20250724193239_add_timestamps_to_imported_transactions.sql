-- Add timestamp columns to imported_transactions table for incremental sync optimization
-- This enables fetching only new/updated records instead of full table scans

-- Add created_at and updated_at columns
ALTER TABLE imported_transactions 
ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_imported_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at on record changes
CREATE TRIGGER update_imported_transactions_updated_at_trigger
    BEFORE UPDATE ON imported_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_imported_transactions_updated_at();

-- Create indexes on timestamp columns for better query performance
CREATE INDEX idx_imported_transactions_created_at ON imported_transactions(created_at);
CREATE INDEX idx_imported_transactions_updated_at ON imported_transactions(updated_at);

-- Create composite index for company_id + timestamp filtering (common query pattern)
CREATE INDEX idx_imported_transactions_company_timestamps ON imported_transactions(company_id, created_at, updated_at);

-- Add comment explaining the purpose
COMMENT ON COLUMN imported_transactions.created_at IS 'Timestamp when the record was created, used for incremental sync optimization';
COMMENT ON COLUMN imported_transactions.updated_at IS 'Timestamp when the record was last updated, automatically maintained by trigger';