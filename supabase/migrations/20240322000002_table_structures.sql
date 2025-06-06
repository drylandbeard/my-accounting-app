-- Current structure of plaid_items table
/*
plaid_items table columns:
- id (UUID, PRIMARY KEY)
- user_id (UUID, NOT NULL)
- access_token (TEXT, NOT NULL)
- item_id (TEXT, NOT NULL)
- institution_id (TEXT)
- institution_name (TEXT)
- created_at (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- updated_at (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
*/

-- Current structure of accounts table
/*
accounts table columns:
- id (UUID, PRIMARY KEY)
- plaid_account_id (TEXT, UNIQUE)
- name (TEXT, NOT NULL)
- institution_name (TEXT)
- account_number (TEXT)
- type (TEXT, NOT NULL)
- subtype (TEXT)
- currency (TEXT, DEFAULT 'USD')
- starting_balance (DECIMAL(19,4), NOT NULL)
- current_balance (DECIMAL(19,4), NOT NULL)
- available_balance (DECIMAL(19,4))
- credit_limit (DECIMAL(19,4))
- interest_rate (DECIMAL(5,2))
- last_synced (TIMESTAMP WITH TIME ZONE, NOT NULL)
- plaid_item_id (TEXT, NOT NULL)
- is_manual (BOOLEAN, DEFAULT FALSE)
- is_active (BOOLEAN, DEFAULT TRUE)
- created_at (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- updated_at (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- metadata (JSONB)
*/ 