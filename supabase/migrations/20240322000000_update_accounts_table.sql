-- Drop existing table if it exists
DROP TABLE IF EXISTS accounts;

-- Create updated accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plaid_account_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    institution_name TEXT,
    account_number TEXT,
    type TEXT NOT NULL,
    subtype TEXT,
    currency TEXT DEFAULT 'USD',
    starting_balance DECIMAL(19,4) NOT NULL,
    current_balance DECIMAL(19,4) NOT NULL,
    available_balance DECIMAL(19,4),
    credit_limit DECIMAL(19,4),
    interest_rate DECIMAL(5,2),
    last_synced TIMESTAMP WITH TIME ZONE NOT NULL,
    plaid_item_id TEXT NOT NULL,
    is_manual BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

-- Create index on plaid_item_id for faster lookups
CREATE INDEX idx_accounts_plaid_item_id ON accounts(plaid_item_id);

-- Create index on is_active for filtering active accounts
CREATE INDEX idx_accounts_is_active ON accounts(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE accounts IS 'Stores bank account information from Plaid and manual entries';

-- Add comments to columns
COMMENT ON COLUMN accounts.id IS 'Primary key';
COMMENT ON COLUMN accounts.plaid_account_id IS 'Unique identifier from Plaid';
COMMENT ON COLUMN accounts.name IS 'Account name';
COMMENT ON COLUMN accounts.institution_name IS 'Name of the financial institution';
COMMENT ON COLUMN accounts.account_number IS 'Last 4 digits of account number';
COMMENT ON COLUMN accounts.type IS 'Account type (e.g., checking, savings, credit)';
COMMENT ON COLUMN accounts.subtype IS 'Account subtype from Plaid';
COMMENT ON COLUMN accounts.currency IS 'Currency code (default: USD)';
COMMENT ON COLUMN accounts.starting_balance IS 'Initial balance when account was added';
COMMENT ON COLUMN accounts.current_balance IS 'Current account balance';
COMMENT ON COLUMN accounts.available_balance IS 'Available balance for checking accounts';
COMMENT ON COLUMN accounts.credit_limit IS 'Credit limit for credit accounts';
COMMENT ON COLUMN accounts.interest_rate IS 'Interest rate for interest-bearing accounts';
COMMENT ON COLUMN accounts.last_synced IS 'Timestamp of last successful sync with Plaid';
COMMENT ON COLUMN accounts.plaid_item_id IS 'Reference to the Plaid item';
COMMENT ON COLUMN accounts.is_manual IS 'Whether this is a manually added account';
COMMENT ON COLUMN accounts.is_active IS 'Whether the account is currently active';
COMMENT ON COLUMN accounts.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN accounts.updated_at IS 'Timestamp when the record was last updated';
COMMENT ON COLUMN accounts.metadata IS 'Additional Plaid data in JSON format'; 