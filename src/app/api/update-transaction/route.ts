import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

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
      companyId 
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

    if (!selectedCategoryId) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      )
    }

    // Verify the transaction exists and belongs to the company
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('id, company_id')
      .eq('id', transactionId)
      .eq('company_id', companyId)
      .single()

    if (fetchError || !existingTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found or access denied' },
        { status: 404 }
      )
    }

    // Verify the category exists and belongs to the company
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

    // Prepare update data
    const updateData = {
      date,
      description,
      spent: spent || 0,
      received: received || 0,
      selected_category_id: selectedCategoryId,
      corresponding_category_id: correspondingCategoryId,
      payee_id: payeeId || null
    }

    // Update the transaction
    const { error: updateError } = await supabase
      .from('transactions')
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