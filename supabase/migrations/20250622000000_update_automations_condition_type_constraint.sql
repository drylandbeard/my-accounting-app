-- Update the condition_type check constraint to only allow simplified values
-- Drop the old constraint
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_condition_type_check;

-- Add the new constraint with simplified values
ALTER TABLE automations ADD CONSTRAINT automations_condition_type_check 
    CHECK (condition_type IN ('contains', 'is_exactly'));

-- Update any existing records that use the old condition types
UPDATE automations 
SET condition_type = 'is_exactly' 
WHERE condition_type IN ('equals');

UPDATE automations 
SET condition_type = 'contains' 
WHERE condition_type IN ('starts_with', 'ends_with'); 