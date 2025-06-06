const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://shsxpnkascjzyvyoadyw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoc3hwbmthc2Nqenl2eW9hZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMzY3MzMsImV4cCI6MjA2MTcxMjczM30.C40VTY41QH2AMzeJrLHPp96qBgw3tgqS4JnAj1uSMTY'
)

async function checkSchema() {
  try {
    // Query the accounts table structure
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .limit(10)

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError)
    } else {
      console.log('Accounts table has', accounts.length, 'rows');
      if (accounts.length > 0) {
        console.log('First account:', accounts[0]);
      }
    }

    // Also check chart_of_accounts table
    const { data: chartColumns, error: chartError } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .limit(1)
      .single()

    if (chartError) {
      console.error('Error fetching chart_of_accounts schema:', chartError)
    } else {
      console.log('Chart of accounts table columns:', Object.keys(chartColumns))
    }
  } catch (error) {
    console.error('Error checking schema:', error)
  }
}

checkSchema()
