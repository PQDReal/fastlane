import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  const publicKeyName = 'NEXT_PUBLIC_VIETMAP_API_KEY'
  const apiKey = process.env.VIETMAP_API_KEY?.trim() || process.env[publicKeyName]?.trim() || null
  const searchApiKey = process.env.VIETMAP_SEARCH_API_KEY?.trim() || process.env.NEXT_PUBLIC_VIETMAP_SEARCH_API_KEY?.trim() || apiKey
  return NextResponse.json(
    { data: { apiKey, searchApiKey } },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
