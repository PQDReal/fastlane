import { NextResponse } from 'next/server'
import { apiErrorResponse, ApiRouteError } from '@/lib/api/errors'
import { getCurrentUser } from '@/lib/auth/current-user'
import { markAdminNotificationRead } from '@/lib/notifications/server'
type Context = { params: Promise<{ notificationId: string }> }
export async function PATCH(_request: Request, context: Context) { try { const user = await getCurrentUser(); if (!user) throw new ApiRouteError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'); if (user.role !== 'ADMIN') throw new ApiRouteError(403, 'INSUFFICIENT_PERMISSION', 'Administrator access is required.'); await markAdminNotificationRead((await context.params).notificationId); return NextResponse.json({ data: { success: true } }) } catch (error) { return apiErrorResponse(error) } }
