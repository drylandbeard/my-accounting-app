# Multi-Company Plaid Integration

This document explains how the Plaid integration has been updated to support multiple companies with proper data isolation.

## Overview

All Plaid-related data is now scoped to specific companies. Each company has its own separate:

- Plaid connections (`plaid_items`)
- Bank accounts (`accounts`)
- Chart of accounts categories (`chart_of_accounts`)
- Imported transactions (`imported_transactions`)
- Processed transactions (`transactions`)
- Journal entries (`journal`)
- Categorization rules (`categorization_rules`)

## Database Changes

### New Columns Added

All Plaid-related tables now have a `company_id` column:

```sql
-- Tables updated with company_id:
- plaid_items (already had it)
- accounts (already had it) 
- chart_of_accounts (new)
- categorization_rules (new)
- imported_transactions (new)
- journal (new)
- transactions (new)
```

### Updated Constraints

- **Unique constraints** now include `company_id` to allow same account names/types across companies
- **Foreign key constraints** ensure proper data relationships within company scope
- **NOT NULL constraints** ensure all records have valid company associations

## API Changes

### Authentication & Authorization

All API endpoints now require company context via headers:

```typescript
// Required headers for all Plaid API calls
{
  "x-user-id": "user-uuid",
  "x-company-id": "company-uuid"
}
```

### Updated Endpoints

1. **`/api/1-create-link-token`** - Validates company context
2. **`/api/2-exchange-public-token`** - Stores items with company_id
3. **`/api/3-store-plaid-accounts-as-accounts`** - Creates accounts scoped to company
4. **`/api/4-store-plaid-accounts-as-categories`** - Creates chart entries scoped to company
5. **`/api/5-import-transactions-to-categorize`** - Imports transactions scoped to company
6. **`/api/6-move-to-transactions`** - Moves transactions within company scope

### Error Handling

APIs return `401 Unauthorized` if:
- User is not authenticated (`x-user-id` missing)
- Company is not selected (`x-company-id` missing)

## Frontend Integration

### Custom Hook

Use `useApiWithCompany()` hook for automatic company context:

```typescript
import { useApiWithCompany } from "@/hooks/useApiWithCompany";

const { postWithCompany, getWithCompany, hasCompanyContext } = useApiWithCompany();

// Automatically includes company headers
const response = await postWithCompany("/api/2-exchange-public-token", {
  public_token: "public_token_from_plaid"
});
```

### Company Context Validation

```typescript
if (!hasCompanyContext) {
  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p>Please select a company to use Plaid integration.</p>
    </div>
  );
}
```

## Data Isolation Benefits

### Complete Separation
- Company A's bank accounts are completely invisible to Company B
- Transactions, categories, and rules are company-specific
- No risk of data leakage between companies

### Scalability
- Each company can have unlimited Plaid connections
- Performance optimized with company-specific queries
- Independent data processing per company

### Security
- Row-level security through company_id filtering
- API-level validation prevents cross-company access
- Database constraints ensure data integrity

## Migration Process

### Existing Data
The migration automatically:
1. Creates a default company if none exists
2. Assigns existing records to the default company
3. Adds NOT NULL constraints to company_id columns

### Zero Downtime
- Backwards compatible during migration
- Existing functionality preserved
- Gradual rollout possible

## Usage Examples

### Creating a Plaid Connection

```typescript
// 1. Create link token (company context automatic)
const linkResponse = await getWithCompany("/api/1-create-link-token");
const { link_token } = await linkResponse.json();

// 2. Use Plaid Link with the token
// ... Plaid Link flow ...

// 3. Exchange public token (company context automatic)
const exchangeResponse = await postWithCompany("/api/2-exchange-public-token", {
  public_token: publicTokenFromPlaid
});

// 4. Store accounts (company context automatic)
const accountsResponse = await postWithCompany("/api/3-store-plaid-accounts-as-accounts", {
  accessToken,
  itemId,
  selectedAccountIds: ["account1", "account2"]
});

// 5. Create chart of accounts (company context automatic)
const chartResponse = await postWithCompany("/api/4-store-plaid-accounts-as-categories", {
  accessToken,
  itemId,
  selectedAccountIds: ["account1", "account2"]
});

// 6. Import transactions (company context automatic)
const transactionsResponse = await postWithCompany("/api/5-import-transactions-to-categorize", {
  accessToken,
  itemId,
  accountDateMap: {
    "account1": "2024-01-01",
    "account2": "2024-01-01"
  }
});
```

### Querying Company-Specific Data

```sql
-- All queries automatically filtered by company_id
SELECT * FROM accounts WHERE company_id = $1;
SELECT * FROM transactions WHERE company_id = $1;
SELECT * FROM chart_of_accounts WHERE company_id = $1;
```

## Best Practices

### Frontend
- Always check `hasCompanyContext` before making Plaid API calls
- Use `useApiWithCompany()` hook for all company-scoped requests
- Display company name in UI for clarity

### Backend
- Validate company context in all API endpoints
- Filter all database queries by company_id
- Log company context for debugging

### Database
- Include company_id in all WHERE clauses
- Use company_id in indexes for performance
- Ensure foreign keys respect company boundaries

## Troubleshooting

### Common Issues

1. **"Missing company context" error**
   - Ensure user has selected a company
   - Check `currentCompany` in auth context

2. **"No accounts found" error**
   - Verify Step 3 completed successfully
   - Check company_id matches between steps

3. **Duplicate key violations**
   - Updated unique constraints include company_id
   - Same account names allowed across companies

### Debug Queries

```sql
-- Check company associations
SELECT 
  c.name as company_name,
  COUNT(pi.id) as plaid_connections,
  COUNT(a.id) as accounts,
  COUNT(t.id) as transactions
FROM companies c
LEFT JOIN plaid_items pi ON c.id = pi.company_id
LEFT JOIN accounts a ON c.id = a.company_id  
LEFT JOIN transactions t ON c.id = t.company_id
GROUP BY c.id, c.name;
```

## Security Considerations

- All company data is isolated at the database level
- API endpoints validate company membership
- No cross-company data access possible
- Audit trail includes company context
- Row-level security enforced through application logic 