-- Add selected_category_id to imported_transactions table for automation support
-- This allows automations to pre-select categories for transactions before they're confirmed

ALTER TABLE imported_transactions 
ADD COLUMN selected_category_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_imported_transactions_selected_category_id ON imported_transactions(selected_category_id);

-- Add comment to document purpose
COMMENT ON COLUMN imported_transactions.selected_category_id IS 'Category selected by automation or manual assignment before transaction confirmation'; 