export type CustomerNotification = {
  id: string
  type: 'ORDER_STATUS_CHANGED' | 'ORDER_CREATED' | 'ORDER_PAID' | 'ORDER_CANCELLED' | 'DEPOSIT_CREATED' | 'DEPOSIT_PAID' | 'DEPOSIT_CANCELLED' | 'TEST_DRIVE_CREATED' | 'CONTRACT_ISSUED' | 'CONTRACT_SIGNATURE_REMINDER' | 'CONTRACT_EXPIRED' | 'REFUND_STARTED' | 'REFUND_COMPLETED' | 'REFUND_FAILED' | 'REFUND_STATUS_CHANGED' | 'VEHICLE_READY_FOR_DELIVERY'
  title: string
  message: string
  orderType: 'ACCESSORY' | 'DEPOSIT' | 'TEST_DRIVE'
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
