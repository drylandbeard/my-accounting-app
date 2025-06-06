import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://shsxpnkascjzyvyoadyw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoc3hwbmthc2Nqenl2eW9hZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMzY3MzMsImV4cCI6MjA2MTcxMjczM30.C40VTY41QH2AMzeJrLHPp96qBgw3tgqS4JnAj1uSMTY'
)

async function checkSchema() {
  try {
    // Query the accounts table structure
    const { data: accountsColumns, error: accountsError } = await supabase
      .rpc('get_table_schema', { table_name: 'accounts' })

    if (accountsError) {
      console.error('Error fetching accounts schema:', accountsError)
    } else {
      console.log('Accounts table columns:', accountsColumns)
    }

    // Also check chart_of_accounts table
    const { data: chartColumns, error: chartError } = await supabase
      .rpc('get_table_schema', { table_name: 'chart_of_accounts' })

    if (chartError) {
      console.error('Error fetching chart_of_accounts schema:', chartError)
    } else {
      console.log('Chart of accounts table columns:', chartColumns)
    }
  } catch (error) {
    console.error('Error checking schema:', error)
  }
}

checkSchema()
