import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type AdminModuleSummary = {
  key: string
  table: string
  count: number | null
  available: boolean
}

export type RecentAdminOrder = {
  id: string
  orderNumber: string
  customerName: string
  status: string
  totalAmount: number
  createdAt: string
}

export type RecentTestDrive = {
  id: string
  referenceNumber: string
  customerName: string
  productName: string
  status: string
  scheduledAt: string
}

export type AdminDashboardData = {
  modules: AdminModuleSummary[]
  metrics: {
    todayRevenue: number
    todayOrders: number
    pendingOrders: number
    lowStockItems: number
    pendingTestDrives: number
    activePromotions: number
  }
  recentOrders: RecentAdminOrder[]
  recentTestDrives: RecentTestDrive[]
  revenueOrders: { createdAt: string; totalAmount: number }[]
}

const MODULE_TABLES = [
  ['categories', 'categories'],
  ['products', 'products'],
  ['orders', 'orders'],
  ['testDrive', 'reservations'],
  ['inventory', 'inventory_items'],
  ['promotions', 'promotions'],
  ['costPolicies', 'on_road_fee_policies'],
  ['customers', 'users'],
] as const

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const [
    modules,
    todayOrdersResult,
    pendingOrdersResult,
    lowStockResult,
    pendingTestDrivesResult,
    activePromotionsResult,
    recentOrdersResult,
    recentTestDrivesResult,
    revenueOrdersResult,
  ] = await Promise.all([
    Promise.all(
      MODULE_TABLES.map(async ([key, table]) => {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
        return { key, table, count: error ? null : count ?? 0, available: !error }
      }),
    ),
    supabase.from('orders').select('total_amount,status').gte('created_at', startOfTodayIso()),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('inventory_items').select('*', { count: 'exact', head: true }).lte('on_hand_quantity', 5),
    supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('type', 'TEST_DRIVE').eq('status', 'REQUESTED'),
    supabase.from('promotions').select('*', { count: 'exact', head: true }).eq('is_active', true).lte('starts_at', now).or(`ends_at.is.null,ends_at.gt.${now}`),
    supabase.from('orders').select('id,order_number,status,total_amount,shipping_address,created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('reservations').select('id,reference_number,full_name,product_name_snapshot,status,scheduled_at').eq('type', 'TEST_DRIVE').order('created_at', { ascending: false }).limit(5),
    supabase.from('orders').select('total_amount,created_at').neq('status', 'CANCELLED').gte('created_at', new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString()).order('created_at', { ascending: true }).limit(10000),
  ])

  const todayOrders = todayOrdersResult.error ? [] : todayOrdersResult.data ?? []
  const recentOrders = recentOrdersResult.error ? [] : (recentOrdersResult.data ?? []).map((order) => {
    const address = order.shipping_address && typeof order.shipping_address === 'object' && !Array.isArray(order.shipping_address)
      ? order.shipping_address as Record<string, unknown>
      : {}
    return {
      id: order.id,
      orderNumber: order.order_number,
      customerName: typeof address.recipientName === 'string' ? address.recipientName : 'Khách hàng',
      status: order.status,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
    }
  })

  const recentTestDrives = recentTestDrivesResult.error ? [] : (recentTestDrivesResult.data ?? []).map((reservation) => ({
    id: reservation.id,
    referenceNumber: reservation.reference_number,
    customerName: reservation.full_name,
    productName: reservation.product_name_snapshot,
    status: reservation.status,
    scheduledAt: reservation.scheduled_at,
  }))

  return {
    modules,
    metrics: {
      todayRevenue: todayOrders
        .filter((order) => order.status !== 'CANCELLED')
        .reduce((total, order) => total + Number(order.total_amount), 0),
      todayOrders: todayOrders.length,
      pendingOrders: pendingOrdersResult.error ? 0 : pendingOrdersResult.count ?? 0,
      lowStockItems: lowStockResult.error ? 0 : lowStockResult.count ?? 0,
      pendingTestDrives: pendingTestDrivesResult.error ? 0 : pendingTestDrivesResult.count ?? 0,
      activePromotions: activePromotionsResult.error ? 0 : activePromotionsResult.count ?? 0,
    },
    recentOrders,
    recentTestDrives,
    revenueOrders: revenueOrdersResult.error ? [] : (revenueOrdersResult.data ?? []).map((order) => ({
      createdAt: order.created_at,
      totalAmount: Number(order.total_amount),
    })),
  }
}
