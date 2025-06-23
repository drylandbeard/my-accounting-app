# AI System Store Integration

## Overview

The AI system has been updated to use the centralized categoriesStore (Zustand) instead of separate AI functions, creating a consistent architecture where the AI agent uses the same data layer as the rest of the application. This eliminates code duplication and ensures all category operations go through a single, well-tested interface.

## Key Changes

### 1. Updated AI Tools (`src/ai/tools.ts`)

The AI tools now use clean, business-focused parameters and accurately describe the categoriesStore integration:

- **create_category**: Uses categoriesStore with built-in validation and error handling
- **update_category**: Uses categoriesStore with validation and optimistic updates  
- **delete_category**: Uses categoriesStore with comprehensive validation (subcategories and transaction usage)
- **assign_parent_category**: Uses categoriesStore with circular dependency validation
- **change_category_type**: Uses categoriesStore with parent-child type consistency validation

Removed unnecessary metadata like `apiEndpoint` and `method` parameters since the store abstracts all implementation details.

### 2. Removed AI Functions Directory (`src/ai/functions/`)

The separate AI function files have been removed as they were creating code duplication:

- ~~createCategory.ts~~ → Uses `categoriesStore.addCategory()`
- ~~renameCategory.ts~~ → Uses `categoriesStore.updateCategory()` 
- ~~deleteCategory.ts~~ → Uses `categoriesStore.deleteCategory()`
- ~~assignParentCategory.ts~~ → Uses helper function with `categoriesStore.updateCategory()`
- ~~changeCategoryType.ts~~ → Uses helper function with `categoriesStore.updateCategory()`

### 3. Updated AI Side Panel (`src/components/AISidePanel.tsx`)

The AISidePanel now uses the categoriesStore directly:

#### Store Integration
- Imports and uses `useCategoriesStore()` hook
- All category operations go through store methods
- Benefits from optimistic updates and automatic error handling
- Consistent with the rest of the application

#### Helper Functions
Added two helper functions within AISidePanel for complex operations:

- **`assignParentCategory`**: Validates relationships and prevents circular dependencies before calling `updateCategory`
- **`changeCategoryType`**: Validates type consistency with parent/children before calling `updateCategory`

#### Removed Dependencies
- Removed imports for deleted AI function files
- Removed `AISharedContext` wrapper (no longer needed)
- Simplified architecture with fewer moving parts

### 4. Store Interface Updates (`src/zustand/categoriesStore.ts`)

Updated the `addCategory` method signature to match actual implementation:
```typescript
// Before: 
addCategory: (category: Omit<Category, 'id'>) => Promise<Category | null>

// After:
addCategory: (category: { name: string; type: string; parent_id?: string | null }) => Promise<Category | null>
```

The store handles `company_id` automatically via API headers, so it's not needed in the method signature.

## Benefits

### Single Source of Truth
- All category operations (UI and AI) use the same categoriesStore
- Eliminates code duplication between AI functions and application logic
- Changes to business logic only need to be made in the store

### Consistent Behavior
- AI operations use the same validation, error handling, and optimistic updates as manual operations
- Same authentication and company context handling
- Unified error messages and state management

### Better Performance
- Optimistic updates provide immediate UI feedback
- Automatic cache invalidation and state synchronization
- Reduced API calls through smart state management

### Maintainability
- Simplified architecture with fewer layers
- Type-safe operations through Zustand store
- Easier to test and debug

### Security
- All operations go through the same authentication checks
- Company context automatically handled by API client
- No direct Supabase access from AI components

## Current Architecture

```
AI Agent → categoriesStore → API Routes → Supabase
     ↘                   ↗
       Manual UI Operations
```

Both AI and manual operations use the same categoriesStore, which handles:
- API communication
- Authentication headers  
- Error handling
- Optimistic updates
- State management
- Validation

## API Integration

The categoriesStore uses these API endpoints:

### Implemented API Routes
- **POST** `/api/category/create` - Create new categories (used by `addCategory`)
- **PUT** `/api/category/update` - Update existing categories (used by `updateCategory`)

### Store-Level Operations  
- **DELETE** operations - Handled directly by store with comprehensive validation
- **Parent assignment** - Uses `updateCategory` with relationship validation
- **Type changes** - Uses `updateCategory` with consistency validation

## Usage Examples

### Creating a Category via AI
```typescript
// AI tool call
{
  "action": "create_category", 
  "name": "Office Supplies",
  "type": "Expense",
  "parent_id": "parent-category-id" // optional
}

// This calls: categoriesStore.addCategory()
// Which internally uses: POST /api/category/create
// With automatic authentication and company context
```

### Updating a Category via AI
```typescript
// AI tool call
{
  "action": "update_category",
  "categoryId": "category-id", 
  "name": "New Name", // optional
  "type": "Asset", // optional  
  "parent_id": "new-parent-id" // optional
}

// This calls: categoriesStore.updateCategory()
// With optimistic updates and error handling
```

### Complex Operations via AI
```typescript
// Assign parent category
{
  "action": "assign_parent_category",
  "childCategoryId": "child-id",
  "parentCategoryId": "parent-id"  
}

// This calls: assignParentCategory helper function
// Which validates relationships and calls categoriesStore.updateCategory()
```

## Migration Benefits

- **Simplified Architecture**: Removed unnecessary abstraction layers
- **Better Performance**: Optimistic updates and state management
- **Type Safety**: Full TypeScript coverage through Zustand store  
- **Consistency**: AI and manual operations use identical logic
- **Maintainability**: Single place to update business logic
- **Testing**: Easier to test store methods than scattered AI functions

## Future Enhancements

With the store-based architecture, we can easily add:

- **Batch Operations**: Store methods for multiple category operations
- **Real-time Updates**: WebSocket integration through store
- **Caching Strategies**: Enhanced store-level caching
- **Audit Logging**: Centralized logging in store methods
- **Validation Rules**: Enhanced business rule validation
- **Undo/Redo**: Store-based operation history 