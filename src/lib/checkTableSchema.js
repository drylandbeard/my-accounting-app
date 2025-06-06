const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://shsxpnkascjzyvyoadyw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoc3hwbmthc2Nqenl2eW9hZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMzY3MzMsImV4cCI6MjA2MTcxMjczM30.C40VTY41QH2AMzeJrLHPp96qBgw3tgqS4JnAj1uSMTY'
)

async function checkSchema() {
  try {
    // Query information_schema to get column information
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'accounts')
      .eq('table_schema', 'public')

    if (columnsError) {
      console.error('Error fetching columns:', columnsError)
    } else {
      console.log('Accounts table columns:')
      columns.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type})`)
      })
    }

  } catch (error) {
    console.error('Error checking schema:', error)
  }
}

checkSchema()
