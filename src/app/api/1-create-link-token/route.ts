import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { Products, CountryCode } from 'plaid'
import { validateCompanyContext } from '@/lib/auth-utils'

export async function GET(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req)
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: 401 })
    }

    const { userId } = context

    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: userId, // Use actual user ID
      },
      client_name: 'Switch',
      products: [(process.env.PLAID_PRODUCTS as Products) || Products.Transactions],
      country_codes: [(process.env.PLAID_COUNTRY_CODE as CountryCode) || CountryCode.Us],
      language: 'en',
      redirect_uri: process.env.PLAID_REDIRECT_URI, // use env variable!
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 })
  }
}
