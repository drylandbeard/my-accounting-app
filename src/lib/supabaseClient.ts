import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://shsxpnkascjzyvyoadyw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoc3hwbmthc2Nqenl2eW9hZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMzY3MzMsImV4cCI6MjA2MTcxMjczM30.C40VTY41QH2AMzeJrLHPp96qBgw3tgqS4JnAj1uSMTY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)