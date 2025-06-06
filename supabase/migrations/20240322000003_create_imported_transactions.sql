-- Create imported_transactions table
CREATE TABLE imported_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    plaid_account_id TEXT NOT NULL,
    plaid_account_name TEXT,
    item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
    spent DECIMAL(12,2),
    received DECIMAL(12,2)
);

-- Add indexes for performance
CREATE INDEX idx_imported_transactions_plaid_account_id ON imported_transactions(plaid_account_id);
CREATE INDEX idx_imported_transactions_item_id ON imported_transactions(item_id);
CREATE INDEX idx_imported_transactions_date ON imported_transactions(date);

-- Add RLS policies
ALTER TABLE imported_transactions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own imported transactions
CREATE POLICY "Users can view their own imported transactions"
    ON imported_transactions
    FOR SELECT
    USING (
        item_id IN (
            SELECT id FROM plaid_items WHERE user_id = auth.uid()
        )
    );

-- Create policy to allow users to insert their own imported transactions
CREATE POLICY "Users can insert their own imported transactions"
    ON imported_transactions
    FOR INSERT
    WITH CHECK (
        item_id IN (
            SELECT id FROM plaid_items WHERE user_id = auth.uid()
        )
    );

-- Create policy to allow users to update their own imported transactions
CREATE POLICY "Users can update their own imported transactions"
    ON imported_transactions
    FOR UPDATE
    USING (
        item_id IN (
            SELECT id FROM plaid_items WHERE user_id = auth.uid()
        )
    );

-- Create policy to allow users to delete their own imported transactions
CREATE POLICY "Users can delete their own imported transactions"
    ON imported_transactions
    FOR DELETE
    USING (
        item_id IN (
            SELECT id FROM plaid_items WHERE user_id = auth.uid()
        )
    ); 