-- Add display_order column to accounts table for custom account ordering
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create an index on display_order for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_display_order ON accounts(display_order);

-- Update existing accounts to have sequential display_order values based on creation order
UPDATE accounts 
SET display_order = sub.row_num - 1
FROM (
  SELECT 
    plaid_account_id,
    ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) as row_num
  FROM accounts
) sub
WHERE accounts.plaid_account_id = sub.plaid_account_id
AND accounts.display_order = 0; 