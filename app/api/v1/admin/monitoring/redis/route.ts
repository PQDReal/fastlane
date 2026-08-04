import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getRedisMonitoring } from '@/lib/redis'

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
    return NextResponse.json({ data: await getRedisMonitoring() }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    return NextResponse.json({ error: 'Không thể kiểm tra Redis.' }, { status: 500 })
  }
}
