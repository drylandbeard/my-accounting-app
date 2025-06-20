-- Add auto_add column to automations table
ALTER TABLE automations ADD COLUMN auto_add BOOLEAN DEFAULT false;

-- Update existing automations to have auto_add = false by default
UPDATE automations SET auto_add = false WHERE auto_add IS NULL;

-- Add comment for the new column
COMMENT ON COLUMN automations.auto_add IS 'Whether this automation should automatically add transactions to the added table when both category and payee are set';
