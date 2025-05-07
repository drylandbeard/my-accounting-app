import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'

export async function GET() {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: 'unique-user-id', // static for now
      },
      client_name: 'Your Accounting App',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      redirect_uri: 'http://localhost:3000', // only needed if you're using OAuth, fine to leave
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 })
  }
}
