export type AccessoryCatalogItem = {
  productId: string
  productSlug: string
  variantId: string
  sku: string
  name: string
  variantName: string
  priceAmount: number
  oldPriceAmount: number | null
  image: string
  images: string[]
  attributes: Record<string, string>
  availableQuantity: number
  discount: number | null
}

export type AccessoryCatalogProduct = {
  productId: string
  productSlug: string
  name: string
  image: string
  variants: AccessoryCatalogItem[]
}

export type SelectedProductOption = {
  groupId: string
  groupCode: string
  groupName: string
  valueId: string
  valueCode: string
  valueName: string
  priceAdjustment: string
}

export type ApiCartItem = {
  id: string
  variantId: string
  productId: string
  productSlug: string
  productName: string
  productKind: 'accessory'
  purchaseTerms: {
    paymentMode: 'full'
    depositAmount: null
    initialPaymentWindowMinutes: number
    balancePaymentWindowDays: null
    gracePeriodHours: null
    cancellationPolicy: {
      customerCancellationAllowed: boolean
      customerCancellationCutoff: 'before_shipping'
      refundPercentage: number
      overdueRefundPercentage: number
      cancellationFeeAmount: string
    }
  }
  sku: string
  variantAttributes: Record<string, string>
  selectedOptions: SelectedProductOption[]
  quantity: number
  unitListPrice: string
  unitSalePrice: string | null
  unitOptionTotal: string
  unitPrice: string
  unitAmountDueNow: string
  lineTotal: string
  lineAmountDueNow: string
  imageUrl: string | null
  availableQuantity: number
}

export type ApiCart = {
  id: string
  version: number
  pricedAt: string
  items: ApiCartItem[]
  promotion: null
  pricing: {
    currency: 'VND'
    subtotal: string
    discountTotal: string
    grandTotal: string
    amountDueNow: string
    balanceDue: string
  }
}

export type CartResponse = { data: ApiCart }

export type AccessoryDetailData = {
  productId: string
  slug: string
  name: string
  description: string | null
  images: string[]
  specifications: Record<string, unknown>
  variants: AccessoryCatalogItem[]
  initialVariantId?: string
}

export type AddCartItemRequest = {
  variantId: string
  quantity: number
}

export type UpdateCartItemRequest = { quantity: number }

export type ShippingAddress = {
  recipientName: string
  phoneNumber: string
  line1: string
  line2?: string
  communeLevel: {
    code?: string
    name: string
    type: 'COMMUNE' | 'WARD' | 'SPECIAL_ZONE'
  }
  province: { code?: string; name: string }
  countryCode: 'VN'
}

export type CheckoutRequest = {
  cartItemIds: string[]
  expectedCartVersion: number
  acceptedGrandTotal: string
  acceptedAmountDueNow: string
  promotionCode?: string
  shippingAddress: ShippingAddress
  note?: string
}

export type AccessoryOrder = {
  id: string
  orderNumber: string
  customer: { id: string; email: string }
  status: 'Created' | 'Paid' | 'Shipped' | 'Completed' | 'Cancelled' | 'Pending' | 'Confirmed' | 'Preparing' | 'Ready' | 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'PENDING_DEPOSIT' | 'PENDING_CONFIRMATION' | 'PENDING_CONTRACT' | 'CONTRACT_SIGNED' | 'PENDING_PAYMENT' | 'PAID' | 'PREPARING_DELIVERY' | 'DELIVERED'
  statusUpdatedAt: string
  pricing: {
    currency: 'VND'
    subtotal: string
    discountTotal: string
    shippingTotal: '0'
    grandTotal: string
    amountDueNow: string
    balanceDue: string
  }
  promotion: null
  payment: {
    status: 'Pending' | 'Paid'
    amountDueAtCheckout: string
    amountPaid: string
    amountRefunded: string
    balanceDue: string
    schedule: {
      initialPaymentDueAt: string
      balanceDueAt: null
      gracePeriodEndsAt: null
    }
    refund: {
      status: 'NotRequired'
      requestedAmount: '0'
      refundedAmount: '0'
      cancellationFeeAmount: '0'
    }
    transactions: []
  }
  cancellationPolicy: ApiCartItem['purchaseTerms']['cancellationPolicy']
  cancellation: null
  shippingAddress: ShippingAddress
  note: string | null
  items: Array<{
    id: string
    variantId: string
    productKind: 'accessory'
    purchaseTerms: ApiCartItem['purchaseTerms']
    sku: string
    productName: string
    variantAttributes: Record<string, string>
    selectedOptions: SelectedProductOption[]
    unitListPrice: string
    unitSalePrice: null
    unitOptionTotal: '0'
    unitPrice: string
    unitAmountDueNow: string
    quantity: number
    lineTotal: string
    lineAmountDueNow: string
  }>
  createdAt: string
  updatedAt: string
}

export type AccessoryOrderSummary = Pick<
  AccessoryOrder,
  'id' | 'orderNumber' | 'createdAt' | 'statusUpdatedAt'
> & {
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'PENDING_DEPOSIT' | 'PENDING_CONFIRMATION' | 'PENDING_CONTRACT' | 'CONTRACT_SIGNED' | 'PENDING_PAYMENT' | 'PAID' | 'PREPARING_DELIVERY' | 'DELIVERED'
  orderType?: 'accessory' | 'deposit'
  carModel?: string
  carVariant?: string
  paymentStatus: 'Pending' | 'Paid'
  nextPaymentDueAt: string | null
  pricing: Pick<
    AccessoryOrder['pricing'],
    'currency' | 'grandTotal' | 'amountDueNow' | 'balanceDue'
  >
  depositDetails?: {
    showroom: string
    exteriorColor: string
    interiorColor: string
    optionalPackages: string[]
    customerName: string
    customerPhone: string
    idCardNumber: string
    province: string
    district: string
    customerType: string
    totalEstimatedPrice: string
    vehicleVariant?: any
  }
}
