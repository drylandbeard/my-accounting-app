import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isPositiveAmount, isZeroAmount, toFinancialAmount } from '@/lib/financial'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      transactionId, 
      date, 
      description, 
      spent, 
      received, 
      selectedCategoryId,
      correspondingCategoryId,
      payeeId,
      companyId,
      isSplitTransaction,
      splits
    } = body

    // Validate required fields
    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      )
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    if (!date || !description) {
      return NextResponse.json(
        { error: 'Date and description are required' },
        { status: 400 }
      )
    }

    // For split transactions, validate splits instead of requiring selectedCategoryId
    if (isSplitTransaction) {
      if (!splits || !Array.isArray(splits) || splits.length === 0) {
        return NextResponse.json(
          { error: 'Split transactions must have at least one split item' },
          { status: 400 }
        )
      }

      // Validate each split item
      for (const split of splits) {
        if (!split.selected_category_id) {
          return NextResponse.json(
            { error: 'Each split item must have a category' },
            { status: 400 }
          )
        }
      }
    } else {
      if (!selectedCategoryId) {
        return NextResponse.json(
          { error: 'Category is required' },
          { status: 400 }
        )
      }
    }

    // Validate that only spent OR received has a value, not both
    const spentValue = spent ?? '0.00';
    const receivedValue = received ?? '0.00';
    
    if (isPositiveAmount(spentValue) && isPositiveAmount(receivedValue)) {
      return NextResponse.json(
        { error: 'A transaction cannot have both spent and received amounts' },
        { status: 400 }
      )
    }

    if (isZeroAmount(spentValue) && isZeroAmount(receivedValue)) {
      return NextResponse.json(
        { error: 'A transaction must have either a spent or received amount' },
        { status: 400 }
      )
    }

    // First, check which table the transaction exists in
    let tableName = 'transactions' // Default to transactions table
    let existingTransaction = null
    
    // Check if transaction exists in transactions table (added)
    const { data: addedTx, error: addedError } = await supabase
      .from('transactions')
      .select('id, company_id')
      .eq('id', transactionId)
      .eq('company_id', companyId)
      .single()

    if (!addedError && addedTx) {
      existingTransaction = addedTx
      tableName = 'transactions'
    } else {
      // Check if transaction exists in imported_transactions table (toAdd)
      const { data: importedTx, error: importedError } = await supabase
        .from('imported_transactions')
        .select('id, company_id')
        .eq('id', transactionId)
        .eq('company_id', companyId)
        .single()

      if (!importedError && importedTx) {
        existingTransaction = importedTx
        tableName = 'imported_transactions'
      }
    }

    if (!existingTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found or access denied' },
        { status: 404 }
      )
    }

    // Verify categories exist and belong to the company
    if (isSplitTransaction && splits) {
      // For split transactions, validate each split category
      for (const split of splits) {
        const { data: splitCategory, error: splitCategoryError } = await supabase
          .from('chart_of_accounts')
          .select('id, name')
          .eq('id', split.selected_category_id)
          .eq('company_id', companyId)
          .single()

        if (splitCategoryError || !splitCategory) {
          return NextResponse.json(
            { error: `Split category not found: ${split.selected_category_id}` },
            { status: 400 }
          )
        }
      }
    } else {
      // For regular transactions, validate the single category
      const { data: category, error: categoryError } = await supabase
        .from('chart_of_accounts')
        .select('id, name')
        .eq('id', selectedCategoryId)
        .eq('company_id', companyId)
        .single()

      if (categoryError || !category) {
        return NextResponse.json(
          { error: 'Selected category not found' },
          { status: 400 }
        )
      }
    }

    // If payeeId is provided, verify it exists and belongs to the company
    if (payeeId) {
      const { data: payee, error: payeeError } = await supabase
        .from('payees')
        .select('id')
        .eq('id', payeeId)
        .eq('company_id', companyId)
        .single()

      if (payeeError || !payee) {
        return NextResponse.json(
          { error: 'Selected payee not found' },
          { status: 400 }
        )
      }
    }

    if (isSplitTransaction && splits) {
      // For split transactions, store split data as JSON in description or create a special field
      // For now, we'll store the split information and handle it when the transaction is moved to Added
      interface SplitItem {
        id: string;
        date: string;
        description: string;
        spent: string;
        received: string;
        payee_id?: string;
        selected_category_id: string;
      }

      const splitData = {
        splits: splits.map((split: SplitItem) => ({
          id: split.id,
          date: split.date,
          description: split.description,
          spent: split.spent ? toFinancialAmount(split.spent) : '0.00',
          received: split.received ? toFinancialAmount(split.received) : '0.00',
          payee_id: split.payee_id,
          selected_category_id: split.selected_category_id
        }))
      };

      // Update the transaction with split information
      const updateData: Record<string, unknown> = {
        date,
        description: description,
        spent: toFinancialAmount(spent || '0.00'),
        received: toFinancialAmount(received || '0.00'),
        payee_id: payeeId || null,
        selected_category_id: selectedCategoryId,
        // Store split data as JSONB object
        split_data: splitData
      };

      // Add category fields based on which table we're updating
      if (tableName === 'transactions') {
        updateData.corresponding_category_id = correspondingCategoryId;
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', transactionId)
        .eq('company_id', companyId)

      if (updateError) {
        console.error('Error updating split transaction:', updateError)
        return NextResponse.json(
          { error: 'Failed to update split transaction' },
          { status: 500 }
        )
      }
    } else {
      // Handle regular (non-split) transaction update
      const baseUpdateData = {
        date,
        description,
        spent: toFinancialAmount(spent || '0.00'),
        received: toFinancialAmount(received || '0.00'),
        payee_id: payeeId || null,
        selected_category_id: selectedCategoryId,
        split_data: null // Clear any existing split data
      }

      // Add category fields based on which table we're updating
      const updateData = tableName === 'transactions' 
        ? {
            ...baseUpdateData,
            corresponding_category_id: correspondingCategoryId
          }
        : baseUpdateData

      // Update the transaction
      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', transactionId)
        .eq('company_id', companyId)

      if (updateError) {
        console.error('Error updating transaction:', updateError)
        return NextResponse.json(
          { error: 'Failed to update transaction' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Transaction updated successfully',
        transactionId 
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error in update-transaction API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 