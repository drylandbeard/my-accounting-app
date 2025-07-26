# AI Categories Implementation Plan

## Overview
Extend the existing AI Assistant in `AISidePanel.tsx` to support category/chart of accounts operations alongside the current payee operations. The current architecture is well-designed and we'll follow the same patterns for consistency and maintainability.

## Current Architecture Analysis

### Existing Payee Implementation
- **AISidePanel.tsx**: Main component that orchestrates AI interactions
- **AIHandler**: Central coordinator that processes user messages and delegates to specific executors
- **PayeeExecutor**: Handles payee operations (create, update, delete)
- **PayeeValidator**: Validates payee operations before execution
- **ChatService**: Manages OpenAI API interactions with payee-specific prompts and tools
- **Types**: Shared type definitions

### Key Strengths of Current Architecture
1. **Separation of Concerns**: Each class has a single responsibility
2. **Validation Layer**: Multi-layer validation (client-side → server-side → database)
3. **Error Handling**: Comprehensive error handling with user-friendly messages
4. **Fresh Data**: Ensures data freshness before operations
5. **Batch Operations**: Support for multiple operations in sequence
6. **Real-time Updates**: Store integration with highlighting for real-time feedback

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Create Category-Specific AI Files

**File: `src/lib/ai/category-executor.ts`**
- Mirror the `PayeeExecutor` architecture
- Support operations: `create_category`, `update_category`, `delete_category`, `move_category`
- Handle category-specific validations (type, parent relationships, etc.)
- Integrate with `useCategoriesStore` methods

**File: `src/lib/ai/category-validator.ts`**
- Mirror the `PayeeValidator` architecture
- Validate category operations with business logic:
  - Name uniqueness within type/parent scope
  - Valid account types (`Asset`, `Liability`, `Equity`, `Revenue`, `COGS`, `Expense`, `Bank Account`, `Credit Card`)
  - Parent-child relationship constraints
  - Circular dependency prevention
  - Bank account linkage validation

**File: `src/lib/ai/category-tools.ts`**
- Define OpenAI function calling tools for category operations
- Include comprehensive parameter definitions and descriptions
- Support complex operations like moving categories between parents

#### 1.2 Extend Core Types

**File: `src/lib/ai/types.ts`**
- Add category operation interfaces:
  ```typescript
  export interface CategoryOperation {
    action: 'create_category' | 'update_category' | 'delete_category' | 'move_category';
    params: CategoryOperationParams;
  }

  export interface CategoryOperationParams {
    name?: string;
    type?: string;
    parent_id?: string | null;
    parent_name?: string;
    categoryId?: string;
    categoryName?: string;
    newParentId?: string | null;
    newParentName?: string;
    [key: string]: unknown;
  }
  ```
- Add category validation context
- Add category-specific error types

### Phase 2: AI Handler Enhancement

#### 2.1 Extend AIHandler Class

**Modifications to `src/lib/ai/ai-handler.ts`:**

1. **Constructor Enhancement**:
   ```typescript
   constructor(
     payeesStore: PayeesStore,
     categoriesStore: CategoriesStore, // NEW
     currentCompany: Company | null,
     apiKey: string
   )
   ```

2. **Add Category Processing**:
   - Create `CategoryExecutor` instance alongside `PayeeExecutor`
   - Extend `processUserMessage` to detect category operations
   - Route category operations to appropriate executor

3. **Enhanced Operation Detection**:
   ```typescript
   private detectOperationType(userMessage: string): 'payee' | 'category' | 'mixed' | 'general'
   ```

4. **Unified Response Processing**:
   - Handle both payee and category tool calls in the same response
   - Support mixed operations (e.g., "create payee X and category Y")

#### 2.2 Enhanced ChatService

**Modifications to `src/lib/ai/chat-service.ts`:**

1. **Unified System Prompts**:
   ```typescript
   getUnifiedSystemPrompt(
     payees: Array<{ name: string }>,
     categories: Array<{ name: string; type: string; parent_id?: string | null }>
   ): string
   ```

2. **Combined Tool Definitions**:
   ```typescript
   getUnifiedTools(): unknown[] // Combine payee and category tools
   ```

3. **Context-Aware Prompts**:
   - Include both payees and categories in context
   - Provide examples of category operations
   - Handle hierarchical category relationships

### Phase 3: AISidePanel Integration

#### 3.1 Store Integration

**Modifications to `src/components/AISidePanel.tsx`:**

1. **Add Categories Store Hook**:
   ```typescript
   const { 
     categories, 
     refreshCategories: refreshCategoriesFromStore,
     error: categoriesError
   } = useCategoriesStore();
   ```

2. **Enhanced AIHandler Initialization**:
   ```typescript
   const handler = new AIHandler(
     payeesStore,
     categoriesStore, // NEW
     currentCompany,
     apiKey
   );
   ```

3. **Data Freshness Management**:
   ```typescript
   // Refresh both stores before AI processing
   await Promise.all([
     refreshPayeesFromStore(),
     refreshCategoriesFromStore()
   ]);
   ```

#### 3.2 Operation Detection Enhancement

1. **Context-Aware Operation Detection**:
   - Detect category keywords: "account", "category", "chart of accounts", account types
   - Handle mixed operations
   - Provide appropriate context to AI

2. **Enhanced Error Handling**:
   - Unified error display for both payee and category operations
   - Clear distinction between operation types in error messages

### Phase 4: Advanced Features

#### 4.1 Hierarchical Category Support

1. **Parent-Child Relationship Management**:
   - AI understanding of category hierarchy
   - Support for "move category X under category Y"
   - Automatic parent creation suggestions

2. **Type-Aware Operations**:
   - AI understanding of account types and their constraints
   - Intelligent suggestions for category types based on name patterns
   - Validation of type changes and their implications

#### 4.2 Batch Operations

1. **Mixed Batch Operations**:
   ```typescript
   interface MixedBatchOperation {
     payeeOperations: PayeeOperation[];
     categoryOperations: CategoryOperation[];
   }
   ```

2. **Dependency Management**:
   - Handle operations that depend on each other
   - Create parent categories before child categories
   - Proper error recovery in batch operations

### Phase 5: Enhanced AI Capabilities

#### 5.1 Intelligent Category Suggestions

1. **Pattern Recognition**:
   - Suggest category types based on naming patterns
   - Recommend parent categories for new categories
   - Detect potential duplicates across the hierarchy

2. **Chart of Accounts Best Practices**:
   - AI knowledge of accounting best practices
   - Suggestions for standard account structures
   - Warning about potential accounting implications

#### 5.2 Natural Language Processing

1. **Enhanced Command Understanding**:
   - "Create an expense category for office supplies under General & Administrative"
   - "Move all marketing categories under the Marketing expense category"
   - "Rename the 'Office Expenses' category to 'Office & Administrative' and update all subcategories"

2. **Context-Aware Responses**:
   - Reference existing category structure in responses
   - Provide hierarchy-aware suggestions
   - Explain the impact of category changes on financial reporting

## Implementation Details

### Category Operation Examples

#### Create Category
```
User: "Create an expense category for office supplies"
AI Response: "I'll create a new expense category called 'Office Supplies'. Would you like me to place it under a parent category?"
```

#### Update Category with Hierarchy
```
User: "Move the 'Software' category under 'Technology Expenses'"
AI Response: "I'll move the 'Software' category to be a subcategory of 'Technology Expenses'. This will affect the organization of your chart of accounts."
```

#### Complex Operations
```
User: "Create a parent category for all marketing expenses and move advertising and promotional costs under it"
AI Response: "I'll:
1. Create a new 'Marketing Expenses' parent category
2. Move 'Advertising' under 'Marketing Expenses'  
3. Move 'Promotional Costs' under 'Marketing Expenses'
Would you like me to proceed?"
```

### Error Handling Examples

#### Duplicate Category
```
AI Response: "❌ A category named 'Office Supplies' already exists in the Expense type. 
Suggestions:
- Use 'Office Supplies & Equipment' instead
- Update the existing category if needed
- Create as a subcategory under 'General Expenses'"
```

#### Invalid Hierarchy
```
AI Response: "❌ Cannot move 'General Expenses' under 'Office Supplies' as it would create a circular dependency.
Current structure: General Expenses → Office Supplies
Suggestion: Consider reorganizing the hierarchy or renaming categories to avoid conflicts."
```

## Data Flow Architecture

```
User Input
    ↓
AISidePanel
    ↓
AIHandler.processUserMessage()
    ↓
Operation Detection (payee/category/mixed)
    ↓
Route to Appropriate Executor
    ↓
CategoryExecutor.executeCategoryOperation()
    ↓
CategoryValidator.validateCategoryOperation()
    ↓
CategoriesStore operations
    ↓
Database operations
    ↓
Real-time updates & UI feedback
```

## Testing Strategy

### Unit Tests
1. **CategoryValidator Tests**:
   - Test all validation scenarios
   - Edge cases for hierarchy validation
   - Type-specific validation rules

2. **CategoryExecutor Tests**:
   - All CRUD operations
   - Batch operation scenarios
   - Error handling and recovery

### Integration Tests
1. **AIHandler Integration**:
   - Mixed payee/category operations
   - Complex multi-step operations
   - Error propagation

2. **Store Integration**:
   - Real-time updates
   - Data freshness scenarios
   - Concurrent operation handling

### User Acceptance Tests
1. **Natural Language Processing**:
   - Various ways of expressing category operations
   - Complex hierarchical commands
   - Edge cases in user input

2. **Error Recovery**:
   - User experience during validation failures
   - Clear error messages and suggestions
   - Recovery from partial failures

## Migration Strategy

### Phase 1: Core Implementation (Week 1)
- Create category-specific AI files
- Extend types and interfaces
- Basic category operation support

### Phase 2: Integration (Week 2)
- Integrate with AISidePanel
- Enhanced AIHandler with mixed operations
- Basic testing and validation

### Phase 3: Advanced Features (Week 3)
- Hierarchical operations
- Batch operations
- Enhanced error handling

### Phase 4: Polish & Testing (Week 4)
- Comprehensive testing
- Performance optimization
- Documentation and examples

## Success Metrics

1. **Functionality**:
   - All category CRUD operations working via AI
   - Hierarchical operations (move, create with parent)
   - Mixed payee/category operations

2. **User Experience**:
   - Natural language understanding for category operations
   - Clear, helpful error messages
   - Intuitive operation confirmation flows

3. **Reliability**:
   - Proper validation preventing data corruption
   - Graceful error handling and recovery
   - Data consistency across operations

4. **Performance**:
   - Fast response times for AI operations
   - Efficient data freshness management
   - Minimal impact on existing payee operations

## Risk Mitigation

### Data Integrity Risks
- **Mitigation**: Multi-layer validation (client → server → database)
- **Validation**: Comprehensive testing of edge cases
- **Recovery**: Transaction-like behavior for batch operations

### User Experience Risks
- **Mitigation**: Clear confirmation flows for destructive operations
- **Validation**: User acceptance testing with complex scenarios
- **Recovery**: Undo functionality for reversible operations

### Performance Risks
- **Mitigation**: Efficient data fetching and caching strategies
- **Validation**: Performance testing with large datasets
- **Recovery**: Progressive enhancement and fallback mechanisms

## Conclusion

This implementation plan extends the existing AI architecture to support categories while maintaining the proven patterns and reliability of the current payee implementation. The modular approach ensures that category support integrates seamlessly without affecting existing functionality, and the comprehensive validation and error handling maintain data integrity across all operations.

The plan provides for a gradual rollout with clear milestones and success metrics, ensuring a robust and user-friendly implementation that enhances the AI Assistant's capabilities while maintaining the high quality standards of the existing codebase.
