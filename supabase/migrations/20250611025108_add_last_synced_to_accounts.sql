-- Add last_synced column to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_synced TIMESTAMP WITH TIME ZONE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_last_synced ON accounts(last_synced);

-- Add comment for documentation
COMMENT ON COLUMN accounts.last_synced IS 'Timestamp of when this account was last synced with Plaid'; 