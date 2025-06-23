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
        client_user_id: userId,
      },
      client_name: 'My Accounting App',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })

    return NextResponse.json({ linkToken: response.data.link_token })
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    )
  }
}
