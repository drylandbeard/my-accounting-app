-- Update financial precision for all monetary columns
-- Using NUMERIC(19,4) to support up to 999,999,999,999,999.9999

-- Update imported_transactions table
ALTER TABLE public.imported_transactions 
ALTER COLUMN spent TYPE NUMERIC(19,4),
ALTER COLUMN received TYPE NUMERIC(19,4);

-- Update transactions table  
ALTER TABLE public.transactions
ALTER COLUMN spent TYPE NUMERIC(19,4),
ALTER COLUMN received TYPE NUMERIC(19,4);

-- Update journal table
ALTER TABLE public.journal
ALTER COLUMN debit TYPE NUMERIC(19,4),
ALTER COLUMN credit TYPE NUMERIC(19,4);

-- Update categorization_rules table (if used)
ALTER TABLE public.categorization_rules
ALTER COLUMN min_amount TYPE NUMERIC(19,4),
ALTER COLUMN max_amount TYPE NUMERIC(19,4);

-- Add comments to document the precision choice
COMMENT ON COLUMN public.accounts.starting_balance IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.accounts.current_balance IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.imported_transactions.spent IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.imported_transactions.received IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.transactions.spent IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.transactions.received IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.journal.debit IS 'Financial amount with 4 decimal precision for exact calculations';
COMMENT ON COLUMN public.journal.credit IS 'Financial amount with 4 decimal precision for exact calculations'; 