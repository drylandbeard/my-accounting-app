import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'

export async function GET() {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: 'unique-user-id', // static for now
      },
      client_name: 'Your Accounting App',
      products: [(process.env.PLAID_PRODUCTS as any) || 'transactions'],
      country_codes: [(process.env.PLAID_COUNTRY_CODE as any) || 'US'],
      language: 'en',
      redirect_uri: process.env.PLAID_REDIRECT_URI, // use env variable!
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 })
  }
}
