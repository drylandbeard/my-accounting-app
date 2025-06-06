-- Add foreign key constraint for plaid_item_id
ALTER TABLE accounts
ADD CONSTRAINT fk_accounts_plaid_items
FOREIGN KEY (plaid_item_id)
REFERENCES plaid_items(id)
ON DELETE CASCADE;

-- Make plaid_account_id nullable in chart_of_accounts
ALTER TABLE chart_of_accounts
ALTER COLUMN plaid_account_id DROP NOT NULL;

-- Add index to improve foreign key performance
CREATE INDEX idx_accounts_plaid_item_id ON accounts(plaid_item_id); 