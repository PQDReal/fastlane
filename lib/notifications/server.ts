import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import type { CustomerNotification } from '@/lib/notifications/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type NotificationRow = {
  id: string
  notification_type: 'ORDER_STATUS_CHANGED'
  title: string
  message: string
  order_type: 'ACCESSORY' | 'DEPOSIT'
  order_id: string
  order_number: string
  current_status: string
  action_url: string
  read_at: string | null
  created_at: string
}

function mapNotification(row: NotificationRow): CustomerNotification {
  return {
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    orderType: row.order_type,
    orderId: row.order_id,
    orderNumber: row.order_number,
    currentStatus: row.current_status,
    actionUrl: row.action_url,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export async function listCustomerNotifications(customerId: string, options: {
  limit: number
  cursor?: string
  unreadOnly?: boolean
}) {
  let query = getSupabaseAdmin()
    .from('customer_notifications')
    .select('id,notification_type,title,message,order_type,order_id,order_number,current_status,action_url,read_at,created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(options.limit + 1)
  if (options.cursor) query = query.lt('created_at', options.cursor)
  if (options.unreadOnly) query = query.is('read_at', null)

  const [{ data, error }, unread] = await Promise.all([
    query,
    getSupabaseAdmin()
      .from('customer_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .is('read_at', null),
  ])
  if (error) throw new Error(`Unable to load notifications: ${error.message}`)
  if (unread.error) throw new Error(`Unable to count notifications: ${unread.error.message}`)

  const rows = (data ?? []) as NotificationRow[]
  const hasMore = rows.length > options.limit
  const visible = rows.slice(0, options.limit)
  return {
    items: visible.map(mapNotification),
    unreadCount: unread.count ?? 0,
    nextCursor: hasMore ? visible.at(-1)?.created_at ?? null : null,
  }
}

export async function markCustomerNotificationRead(customerId: string, notificationId: string) {
  if (!UUID_PATTERN.test(notificationId)) {
    throw new ApiRouteError(400, 'VALIDATION_ERROR', 'notificationId must be a UUID.')
  }
  const { data, error } = await getSupabaseAdmin()
    .from('customer_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('customer_id', customerId)
    .select('id')
  if (error) throw new Error(`Unable to update notification: ${error.message}`)
  if (!data?.length) throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Notification was not found.')
}

export async function markAllCustomerNotificationsRead(customerId: string) {
  const { error } = await getSupabaseAdmin()
    .from('customer_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('customer_id', customerId)
    .is('read_at', null)
  if (error) throw new Error(`Unable to update notifications: ${error.message}`)
}
