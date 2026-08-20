import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { localizeNotificationText } from '@/lib/notifications/localization'
import type { CustomerNotification } from '@/lib/notifications/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type NotificationRow = {
  id: string
  notification_type: 'ORDER_STATUS_CHANGED' | 'CONTRACT_ISSUED' | 'CONTRACT_SIGNATURE_REMINDER' | 'CONTRACT_EXPIRED' | 'REFUND_STARTED' | 'REFUND_COMPLETED' | 'REFUND_FAILED' | 'REFUND_STATUS_CHANGED' | 'VEHICLE_READY_FOR_DELIVERY'
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
    title: localizeNotificationText(row.title),
    message: localizeNotificationText(row.message),
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
export async function countUnreadCustomerNotifications(customerId: string) {
  const { count, error } = await getSupabaseAdmin()
    .from('customer_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .is('read_at', null)
  if (error) throw new Error(`Unable to count notifications: ${error.message}`)
  return count ?? 0
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
type AdminNotificationRow = Omit<NotificationRow, 'notification_type' | 'order_type' | 'current_status'> & {
  notification_type: 'ORDER_CREATED' | 'ORDER_PAID' | 'ORDER_CANCELLED' | 'DEPOSIT_CREATED' | 'DEPOSIT_PAID' | 'DEPOSIT_CANCELLED' | 'TEST_DRIVE_CREATED'
}

const mapAdminNotification = (row: AdminNotificationRow): CustomerNotification => ({
  id: row.id, type: row.notification_type, title: localizeNotificationText(row.title), message: localizeNotificationText(row.message),
  orderType: row.notification_type === 'TEST_DRIVE_CREATED' ? 'TEST_DRIVE' : 'ACCESSORY',
  orderId: row.order_id, orderNumber: row.order_number,
  currentStatus: '', actionUrl: row.action_url, readAt: row.read_at, createdAt: row.created_at,
})

export async function listAdminNotifications(limit: number) {
  const supabase = getSupabaseAdmin()
  const [items, unread] = await Promise.all([
    supabase.from('admin_notifications').select('id,notification_type,title,message,order_id,order_number,action_url,read_at,created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('admin_notifications').select('*', { count: 'exact', head: true }).is('read_at', null),
  ])
  if (items.error) throw items.error
  if (unread.error) throw unread.error
  return { items: (items.data as AdminNotificationRow[]).map(mapAdminNotification), unreadCount: unread.count ?? 0, nextCursor: null }
}

export async function countUnreadAdminNotifications() {
  const { count, error } = await getSupabaseAdmin()
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markAdminNotificationRead(notificationId?: string) {
  let query = getSupabaseAdmin().from('admin_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (notificationId) query = query.eq('id', notificationId)
  const result = await query
  if (result.error) throw result.error
}

export async function notifyAdminCustomerCancelledOrder(order: { id: string; orderNumber: string }) {
  const result = await getSupabaseAdmin().from('admin_notifications').upsert({
    event_key: `ORDER_CANCELLED:${order.id}`, notification_type: 'ORDER_CANCELLED',
    title: 'Khách hàng đã hủy đơn', message: `Khách hàng vừa hủy đơn ${order.orderNumber}.`,
    order_id: order.id, order_number: order.orderNumber,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function notifyAdminCustomerCancelledDeposit(order: { id: string; orderNumber: string }) {
  const result = await getSupabaseAdmin().from('admin_notifications').upsert({
    event_key: `DEPOSIT_CANCELLED:${order.id}`, notification_type: 'DEPOSIT_CANCELLED',
    title: 'Khách hàng đã hủy đơn đặt cọc', message: `Khách hàng vừa hủy đơn đặt cọc ${order.orderNumber}.`,
    order_id: order.id, order_number: order.orderNumber, action_url: '/admin/orders',
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function notifyAdminTestDriveCreated(reservation: {
  id: string
  referenceNumber: string
  fullName: string
  productName: string
  scheduledAt: string
}) {
  const scheduledAt = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(reservation.scheduledAt))
  const result = await getSupabaseAdmin().from('admin_notifications').upsert({
    event_key: `TEST_DRIVE_CREATED:${reservation.id}`,
    notification_type: 'TEST_DRIVE_CREATED',
    title: 'Có lịch lái thử mới',
    message: `${reservation.fullName} đã đăng ký lái thử ${reservation.productName} vào ${scheduledAt}.`,
    order_id: reservation.id,
    order_number: reservation.referenceNumber,
    action_url: '/admin/test-drive',
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function notifyCustomerContractIssued(params: {
  customerId: string
  orderId: string
  orderNumber: string
  dueDateFormatted?: string
  documentMode: 'CAR_CONTRACT' | 'MOTORBIKE_PURCHASE_TERMS'
}) {
  const isMotorbikeTerms = params.documentMode === 'MOTORBIKE_PURCHASE_TERMS'
  const documentName = isMotorbikeTerms ? 'thỏa thuận đặt mua' : 'hợp đồng mua xe'
  const result = await getSupabaseAdmin().from('customer_notifications').upsert({
    event_key: `CONTRACT_ISSUED:${params.orderId}`,
    customer_id: params.customerId,
    notification_type: 'CONTRACT_ISSUED',
    title: isMotorbikeTerms ? 'Thỏa thuận đặt mua đã sẵn sàng' : 'Hợp đồng mua xe đã sẵn sàng',
    message: `${isMotorbikeTerms ? 'Thỏa thuận' : 'Hợp đồng'} cho đơn đặt cọc ${params.orderNumber} đã phát hành. Vui lòng xem và xác nhận ${documentName}${params.dueDateFormatted ? ` trước ${params.dueDateFormatted}` : ''}.`,
    order_type: 'DEPOSIT',
    order_id: params.orderId,
    order_number: params.orderNumber,
    current_status: 'PENDING_CONTRACT',
    action_url: `/profile?tab=car-orders&orderId=${params.orderId}`,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) console.error('Unable to send CONTRACT_ISSUED notification:', result.error)
}

export async function notifyCustomerContractExpired(params: {
  customerId: string
  orderId: string
  orderNumber: string
}) {
  const result = await getSupabaseAdmin().from('customer_notifications').upsert({
    event_key: `CONTRACT_EXPIRED:${params.orderId}`,
    customer_id: params.customerId,
    notification_type: 'CONTRACT_EXPIRED',
    title: 'Đơn đặt cọc đã tự động hủy do quá hạn xác nhận',
    message: `Đơn đặt cọc ${params.orderNumber} đã tự động hủy do quá thời hạn 72 giờ xác nhận tài liệu đặt mua. Tiền cọc đã được chuyển sang trạng thái chờ hoàn tiền.`,
    order_type: 'DEPOSIT',
    order_id: params.orderId,
    order_number: params.orderNumber,
    current_status: 'CANCELLED',
    action_url: `/profile?tab=car-orders&orderId=${params.orderId}`,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) console.error('Unable to send CONTRACT_EXPIRED notification:', result.error)
}
