export type CustomerNotification = {
  id: string
  type: 'ORDER_STATUS_CHANGED'
  title: string
  message: string
  orderType: 'ACCESSORY' | 'DEPOSIT'
  orderId: string
  orderNumber: string
  currentStatus: string
  actionUrl: string
  readAt: string | null
  createdAt: string
}

export type CustomerNotificationsResponse = {
  data: {
    items: CustomerNotification[]
    unreadCount: number
    nextCursor: string | null
  }
}
