import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || 'dev-client-id'
const PLAID_SECRET = process.env.PLAID_SECRET || 'dev-secret'
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox'

const config = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
})

export const plaidClient = new PlaidApi(config)
