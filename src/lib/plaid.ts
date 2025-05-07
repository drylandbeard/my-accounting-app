import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const PLAID_CLIENT_ID = '681695fcc1a0a80023f09b28'
const PLAID_SECRET = '8e14167b5941f096677c0efe960376'
const PLAID_ENV = 'sandbox'  // or 'development' or 'production'

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
