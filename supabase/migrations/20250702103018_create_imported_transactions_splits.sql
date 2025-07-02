-- Create imported_transactions_split table for handling split transactions in "To Add" table
-- This mirrors the journal table structure but references imported_transactions instead of transactions

CREATE TABLE imported_transactions_split (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    imported_transaction_id uuid NOT NULL REFERENCES imported_transactions(id) ON DELETE CASCADE,
    date date NOT NULL,
    description text,
    debit numeric(19,4) DEFAULT 0,
    credit numeric(19,4) DEFAULT 0,
    chart_account_id uuid REFERENCES chart_of_accounts(id),
    payee_id uuid REFERENCES payees(id),
    company_id uuid NOT NULL REFERENCES companies(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_imported_transactions_split_transaction_id ON imported_transactions_split(imported_transaction_id);
CREATE INDEX idx_imported_transactions_split_company_id ON imported_transactions_split(company_id);
CREATE INDEX idx_imported_transactions_split_chart_account_id ON imported_transactions_split(chart_account_id);
CREATE INDEX idx_imported_transactions_split_payee_id ON imported_transactions_split(payee_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE imported_transactions_split ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to access their company's data
CREATE POLICY "Users can manage imported_transactions_split for their company" ON imported_transactions_split
    FOR ALL USING (
        company_id IN (
            SELECT cu.company_id 
            FROM company_users cu 
            WHERE cu.user_id = auth.uid() 
            AND cu.is_active = true
        )
    );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_imported_transactions_split_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER imported_transactions_split_updated_at
    BEFORE UPDATE ON imported_transactions_split
    FOR EACH ROW
    EXECUTE FUNCTION update_imported_transactions_split_updated_at();

-- Add comment
COMMENT ON TABLE imported_transactions_split IS 'Stores split transaction data for imported transactions before they are moved to the journal table'; 