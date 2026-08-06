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
  images: ['/images/vf8.png'],
  attributes: { 'Màu sắc': 'Đỏ' },
  selectedOptions: [{
    groupId: '423e4567-e89b-12d3-a456-426614174002',
    groupCode: 'color',
    groupName: 'Màu sắc',
    valueId: '523e4567-e89b-12d3-a456-426614174002',
    valueCode: 'red',
    valueName: 'Đỏ',
    priceAdjustment: '0',
  }],
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
        variantAttributes: { color: 'red' },
        selectedOptions: catalogItem.selectedOptions,
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
      cartPendingItemIds: {},
      cartOwnerSubject: null,
      cartCacheGeneration: 0,
    })
    vi.restoreAllMocks()
  })

  it('reconciles an optimistic add with the server response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: apiCart(1) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal(
      'fetch',
      fetchMock,
    )

    const result = await useAppStore.getState().addToCart(catalogItem)

    expect(result).toEqual({ ok: true })
    expect(useAppStore.getState().cartItems).toEqual([
      expect.objectContaining({
        variantId: catalogItem.variantId,
        quantity: 1,
        price: 100000,
        selectedOptions: catalogItem.selectedOptions,
      }),
    ])
    expect(useAppStore.getState().getCartTotal()).toBe(100000)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/cart/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ variantId: catalogItem.variantId, quantity: 1 }),
      }),
    )
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
          selectedOptions: catalogItem.selectedOptions,
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

  it('clears the visible cart when the authenticated account changes', () => {
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
          quantity: 2,
          sku: catalogItem.sku,
          selectedOptions: catalogItem.selectedOptions,
          availableQuantity: 5,
        },
      ],
      cartLoaded: true,
      cartOwnerSubject: 'auth0|customer',
    })

    const changed = useAppStore
      .getState()
      .syncCartOwner('auth0|admin')

    expect(changed).toBe(true)
    expect(useAppStore.getState()).toMatchObject({
      cartItems: [],
      cartLoaded: false,
      cartOwnerSubject: 'auth0|admin',
      cartCacheGeneration: 1,
    })
  })

  it('ignores a cart response from the previous account', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pendingResponse))

    useAppStore.getState().syncCartOwner('auth0|customer')
    const customerRequest = useAppStore
      .getState()
      .loadCart('auth0|customer')

    useAppStore.getState().syncCartOwner('auth0|admin')
    resolveRequest?.(
      new Response(JSON.stringify({ data: apiCart(2) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await customerRequest

    expect(useAppStore.getState()).toMatchObject({
      cartItems: [],
      cartLoaded: false,
      cartOwnerSubject: 'auth0|admin',
    })
  })

  it('deduplicates concurrent cart hydration requests for the same owner', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(pendingResponse)
    vi.stubGlobal('fetch', fetchMock)

    useAppStore.getState().syncCartOwner('auth0|customer')
    const firstRequest = useAppStore.getState().loadCart('auth0|customer')
    const secondRequest = useAppStore.getState().loadCart('auth0|customer')

    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveRequest?.(
      new Response(JSON.stringify({ data: apiCart(1) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await Promise.all([firstRequest, secondRequest])

    expect(useAppStore.getState()).toMatchObject({
      cartLoaded: true,
      cartItems: [expect.objectContaining({ quantity: 1 })],
    })
  })

  it('ignores a hydration response after a newer cart mutation starts', async () => {
    let resolveHydration: ((response: Response) => void) | undefined
    let resolveMutation: ((response: Response) => void) | undefined
    const hydrationResponse = new Promise<Response>((resolve) => {
      resolveHydration = resolve
    })
    const mutationResponse = new Promise<Response>((resolve) => {
      resolveMutation = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(hydrationResponse)
      .mockReturnValueOnce(mutationResponse)
    vi.stubGlobal('fetch', fetchMock)

    useAppStore.getState().syncCartOwner('auth0|customer')
    useAppStore.setState({
      cartItems: [{
        id: catalogItem.variantId,
        variantId: catalogItem.variantId,
        productId: catalogItem.productId,
        productSlug: catalogItem.productSlug,
        name: catalogItem.name,
        price: catalogItem.priceAmount,
        image: catalogItem.image,
        quantity: 1,
        sku: catalogItem.sku,
        selectedOptions: catalogItem.selectedOptions,
        availableQuantity: 5,
      }],
      cartLoaded: true,
    })

    const hydrationRequest = useAppStore.getState().loadCart('auth0|customer')
    const mutationRequest = useAppStore
      .getState()
      .updateQuantity(catalogItem.variantId, 2)

    expect(useAppStore.getState().cartItems[0]?.quantity).toBe(2)

    resolveHydration?.(
      new Response(JSON.stringify({ data: apiCart(1) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await hydrationRequest

    expect(useAppStore.getState().cartItems[0]?.quantity).toBe(2)

    resolveMutation?.(
      new Response(JSON.stringify({ data: apiCart(2) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await Promise.all([hydrationRequest, mutationRequest])

    expect(useAppStore.getState().cartItems[0]?.quantity).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the latest quantity intent while an older mutation response is pending', async () => {
    let resolveFirst: ((response: Response) => void) | undefined
    let resolveSecond: ((response: Response) => void) | undefined
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse)
    vi.stubGlobal('fetch', fetchMock)

    useAppStore.getState().syncCartOwner('auth0|customer')
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
          quantity: 1,
          sku: catalogItem.sku,
          selectedOptions: catalogItem.selectedOptions,
          availableQuantity: 5,
        },
      ],
      cartLoaded: true,
    })

    const firstMutation = useAppStore.getState().updateQuantity(catalogItem.variantId, 2)
    const secondMutation = useAppStore.getState().updateQuantity(catalogItem.variantId, 3)

    expect(useAppStore.getState().cartItems[0]?.quantity).toBe(3)
    expect(useAppStore.getState().cartPendingItemIds).toEqual({
      [catalogItem.variantId]: true,
    })

    resolveFirst?.(
      new Response(JSON.stringify({ data: apiCart(2) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await firstMutation

    expect(useAppStore.getState().cartItems[0]?.quantity).toBe(3)
    expect(useAppStore.getState().cartPendingItemIds).toEqual({
      [catalogItem.variantId]: true,
    })

    resolveSecond?.(
      new Response(JSON.stringify({ data: apiCart(3) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await Promise.all([firstMutation, secondMutation])

    expect(useAppStore.getState().cartItems[0]?.quantity).toBe(3)
    expect(useAppStore.getState().cartPendingItemIds).toEqual({})
  })
})
