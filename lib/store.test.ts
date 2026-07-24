import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccessoryCatalogItem, ApiCart } from '@/lib/cart/types'
import { useAppStore } from '@/lib/store'

const catalogItem: AccessoryCatalogItem = {
  productId: '223e4567-e89b-12d3-a456-426614174002',
  productSlug: 'phu-kien-thu-nghiem',
  variantId: '123e4567-e89b-12d3-a456-426614174002',
  sku: 'ACC-001',
  name: 'Phụ kiện thử nghiệm',
  variantName: 'Mặc định',
  priceAmount: 100000,
  oldPriceAmount: null,
  image: '/images/vf8.png',
  attributes: {},
  availableQuantity: 5,
  discount: null,
}

function apiCart(quantity: number): ApiCart {
  return {
    id: '323e4567-e89b-12d3-a456-426614174002',
    version: 1721710000000,
    pricedAt: new Date(0).toISOString(),
    items: [
      {
        id: catalogItem.variantId,
        variantId: catalogItem.variantId,
        productId: catalogItem.productId,
        productSlug: catalogItem.productSlug,
        productName: catalogItem.name,
        productKind: 'accessory',
        purchaseTerms: {
          paymentMode: 'full',
          depositAmount: null,
          initialPaymentWindowMinutes: 30,
          balancePaymentWindowDays: null,
          gracePeriodHours: null,
          cancellationPolicy: {
            customerCancellationAllowed: true,
            customerCancellationCutoff: 'before_shipping',
            refundPercentage: 100,
            overdueRefundPercentage: 100,
            cancellationFeeAmount: '0',
          },
        },
        sku: catalogItem.sku,
        variantAttributes: {},
        selectedOptions: [],
        quantity,
        unitListPrice: '100000',
        unitSalePrice: null,
        unitOptionTotal: '0',
        unitPrice: '100000',
        unitAmountDueNow: '100000',
        lineTotal: String(quantity * 100000),
        lineAmountDueNow: String(quantity * 100000),
        imageUrl: catalogItem.image,
        availableQuantity: 5,
      },
    ],
    promotion: null,
    pricing: {
      currency: 'VND',
      subtotal: String(quantity * 100000),
      discountTotal: '0',
      grandTotal: String(quantity * 100000),
      amountDueNow: String(quantity * 100000),
      balanceDue: '0',
    },
  }
}

describe('useAppStore cart cache', () => {
  beforeEach(() => {
    useAppStore.setState({
      cartItems: [],
      cartId: null,
      cartVersion: 0,
      cartLoading: false,
      cartLoaded: false,
      cartError: null,
    })
    vi.restoreAllMocks()
  })

  it('reconciles an optimistic add with the server response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: apiCart(1) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const result = await useAppStore.getState().addToCart(catalogItem)

    expect(result).toEqual({ ok: true })
    expect(useAppStore.getState().cartItems).toEqual([
      expect.objectContaining({
        variantId: catalogItem.variantId,
        quantity: 1,
        price: 100000,
      }),
    ])
    expect(useAppStore.getState().getCartTotal()).toBe(100000)
  })

  it('rolls back optimistic state when the server rejects the item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'OUT_OF_STOCK', message: 'No stock' },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = await useAppStore.getState().addToCart(catalogItem)

    expect(result).toEqual({
      ok: false,
      code: 'OUT_OF_STOCK',
      message: 'No stock',
    })
    expect(useAppStore.getState().cartItems).toEqual([])
  })

  it('prevents a quantity above provisional availability', async () => {
    useAppStore.setState({
      cartItems: [
        {
          id: catalogItem.variantId,
          variantId: catalogItem.variantId,
          productId: catalogItem.productId,
          productSlug: catalogItem.productSlug,
          name: catalogItem.name,
          price: catalogItem.priceAmount,
          image: catalogItem.image,
          quantity: 5,
          sku: catalogItem.sku,
          availableQuantity: 5,
        },
      ],
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await useAppStore
      .getState()
      .updateQuantity(catalogItem.variantId, 6)

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
