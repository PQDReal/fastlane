import { NextResponse } from 'next/server'
import { apiErrorResponse, ApiRouteError } from '@/lib/api/errors'
import { getCurrentUser } from '@/lib/auth/current-user'
import { listAdminNotifications, markAdminNotificationRead } from '@/lib/notifications/server'

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) throw new ApiRouteError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
  if (user.role !== 'ADMIN') throw new ApiRouteError(403, 'INSUFFICIENT_PERMISSION', 'Administrator access is required.')
}
export async function GET() { try { await requireAdmin(); return NextResponse.json({ data: await listAdminNotifications(20) }, { headers: { 'Cache-Control': 'private, no-store' } }) } catch (error) { return apiErrorResponse(error) } }
export async function POST(request: Request) { try { await requireAdmin(); const body = await request.json().catch(() => null) as { action?: string } | null; if (body?.action !== 'READ_ALL') throw new ApiRouteError(400, 'VALIDATION_ERROR', 'action must be READ_ALL.'); await markAdminNotificationRead(); return NextResponse.json({ data: { success: true } }) } catch (error) { return apiErrorResponse(error) } }
