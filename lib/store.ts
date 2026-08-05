import { create } from 'zustand'

import type {
  AccessoryCatalogItem,
  ApiCart,
  CartResponse,
  SelectedProductOption,
} from '@/lib/cart/types'

export interface CartItem {
  id: string
  variantId: string
  productId: string
  productSlug: string
  name: string
  price: number
  image: string
  quantity: number
  sku: string
  selectedOptions: SelectedProductOption[]
  availableQuantity: number
}

type CartActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string }

type ApiFailure = { error?: { code?: string; message?: string } }

interface AppState {
  searchModalOpen: boolean
  setSearchModalOpen: (open: boolean) => void
  cartItems: CartItem[]
  cartId: string | null
  cartVersion: number
  cartLoading: boolean
  cartLoaded: boolean
  cartError: string | null
  cartPendingItemIds: Record<string, boolean>
  cartOwnerSubject: string | null
  cartCacheGeneration: number
  syncCartOwner: (subject: string | null) => boolean
  loadCart: (ownerSubject?: string) => Promise<CartActionResult>
  addToCart: (
    item: AccessoryCatalogItem,
    quantity?: number,
  ) => Promise<CartActionResult>
  removeFromCart: (id: string) => Promise<CartActionResult>
  updateQuantity: (id: string, quantity: number) => Promise<CartActionResult>
  clearCartCache: () => void
  getCartTotal: () => number
  getCartCount: () => number
}

type CartLoadFlight = {
  key: string
  promise: Promise<CartActionResult>
}

// Cart hydration can be requested by both the Header and the page that owns
// the cart. Keep one request per account/cache generation and protect newer
// optimistic mutation intent from older responses.
let cartLoadFlight: CartLoadFlight | null = null
let cartOperationVersion = 0
const cartItemOperationVersions = new Map<string, number>()

type CartStateSetter = (
  partial:
    | Partial<AppState>
    | ((state: AppState) => Partial<AppState>),
) => void

function clearPendingCartItem(
  set: CartStateSetter,
  itemId: string,
  expectedOperationVersion: number,
) {
  if (cartItemOperationVersions.get(itemId) !== expectedOperationVersion) return

  cartItemOperationVersions.delete(itemId)
  set((state) => {
    const nextPending = { ...state.cartPendingItemIds }
    delete nextPending[itemId]
    return {
      cartPendingItemIds: nextPending,
      cartLoading: Object.keys(nextPending).length > 0,
    }
  })
}

function hasNewerPendingOperation(expectedOperationVersion: number) {
  return [...cartItemOperationVersions.values()]
    .some((operationVersion) => operationVersion > expectedOperationVersion)
}

function mapApiCart(cart: ApiCart) {
  return cart.items.map<CartItem>((item) => ({
    id: item.id,
    variantId: item.variantId,
    productId: item.productId,
    productSlug: item.productSlug,
    name: item.productName,
    price: Number(item.unitPrice),
    image: item.imageUrl || '/images/vf8.png',
    quantity: item.quantity,
    sku: item.sku,
    selectedOptions: item.selectedOptions.map((option) => ({ ...option })),
    availableQuantity: item.availableQuantity,
  }))
}

async function requestCart(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const payload = (await response.json().catch(() => ({}))) as
    | CartResponse
    | ApiFailure

  if (!response.ok) {
    const failure = payload as ApiFailure
    return {
      ok: false as const,
      code: failure.error?.code || 'REQUEST_FAILED',
      message: failure.error?.message || 'Không thể cập nhật giỏ hàng.',
    }
  }

  return { ok: true as const, cart: (payload as CartResponse).data }
}

function cartState(cart: ApiCart, previousItems: CartItem[] = []) {
  const mappedItems = mapApiCart(cart)
  if (previousItems.length > 0) {
    const previousOrder = new Map<string, number>()
    previousItems.forEach((item, index) => {
      previousOrder.set(item.id, index)
      previousOrder.set(item.variantId, index)
    })
    mappedItems.sort((left, right) => {
      const leftOrder = previousOrder.get(left.id)
        ?? previousOrder.get(left.variantId)
        ?? Number.MAX_SAFE_INTEGER
      const rightOrder = previousOrder.get(right.id)
        ?? previousOrder.get(right.variantId)
        ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder
    })
  }

  return {
    cartItems: mappedItems,
    cartId: cart.id,
    cartVersion: cart.version,
    cartLoaded: true,
    cartLoading: false,
    cartError: null,
  }
}

function isCurrentCartOperation(
  get: () => AppState,
  expectedOwner: string | null,
  expectedGeneration: number,
  expectedOperationVersion: number,
) {
  return isCurrentCartScope(get, expectedOwner, expectedGeneration)
    && cartOperationVersion === expectedOperationVersion
}

function isCurrentCartScope(
  get: () => AppState,
  expectedOwner: string | null,
  expectedGeneration: number,
) {
  return (
    get().cartOwnerSubject === expectedOwner &&
    get().cartCacheGeneration === expectedGeneration
  )
}

export const useAppStore = create<AppState>()((set, get) => ({
  searchModalOpen: false,
  setSearchModalOpen: (open) => set({ searchModalOpen: open }),
  cartItems: [],
  cartId: null,
  cartVersion: 0,
  cartLoading: false,
  cartLoaded: false,
  cartError: null,
  cartPendingItemIds: {},
  cartOwnerSubject: null,
  cartCacheGeneration: 0,

  syncCartOwner: (subject) => {
    const normalizedSubject = subject?.trim() || null
    if (get().cartOwnerSubject === normalizedSubject) return false

    cartOperationVersion += 1
    cartItemOperationVersions.clear()
    set((state) => ({
      cartItems: [],
      cartId: null,
      cartVersion: 0,
      cartLoading: false,
      cartLoaded: false,
      cartError: null,
      cartPendingItemIds: {},
      cartOwnerSubject: normalizedSubject,
      cartCacheGeneration: state.cartCacheGeneration + 1,
    }))
    return true
  },

  loadCart: (ownerSubject) => {
    const expectedOwner = ownerSubject ?? get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration

    if (!expectedOwner || get().cartOwnerSubject !== expectedOwner) {
      return Promise.resolve({
        ok: false,
        code: 'CART_OWNER_MISMATCH',
        message: 'Không thể tải giỏ hàng cho phiên tài khoản hiện tại.',
      })
    }

    const flightKey = `${expectedOwner}:${expectedGeneration}`
    if (cartLoadFlight?.key === flightKey) return cartLoadFlight.promise

    const expectedOperationVersion = cartOperationVersion
    set({ cartLoading: true, cartError: null })
    const promise = (async () => {
      const result = await requestCart('/api/v1/cart')
      if (
        !isCurrentCartOperation(
          get,
          expectedOwner,
          expectedGeneration,
          expectedOperationVersion,
        )
      ) {
        return { ok: true as const }
      }
      if (!result.ok) {
        set({ cartLoading: false, cartLoaded: true, cartError: result.message })
        return result
      }
      set(cartState(result.cart))
      return { ok: true as const }
    })()
    cartLoadFlight = { key: flightKey, promise }
    void promise.then(
      () => {
        if (cartLoadFlight?.promise === promise) cartLoadFlight = null
      },
      () => {
        if (cartLoadFlight?.promise === promise) cartLoadFlight = null
      },
    )
    return promise
  },

  addToCart: async (item, quantity = 1) => {
    const expectedOwner = get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration
    const expectedOperationVersion = ++cartOperationVersion
    cartItemOperationVersions.set(item.variantId, expectedOperationVersion)
    const previousItems = get().cartItems
    const existing = previousItems.find(
      (cartItem) => cartItem.variantId === item.variantId,
    )
    const optimisticItems = existing
      ? previousItems.map((cartItem) =>
          cartItem.variantId === item.variantId
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem,
        )
      : [
          ...previousItems,
          {
            id: item.variantId,
            variantId: item.variantId,
            productId: item.productId,
            productSlug: item.productSlug,
            name: item.name,
            price: item.priceAmount,
            image: item.image,
            quantity,
            sku: item.sku,
            selectedOptions: item.selectedOptions.map((option) => ({ ...option })),
            availableQuantity: item.availableQuantity,
          },
        ]

    set({ cartItems: optimisticItems, cartLoading: true, cartError: null })
    set((state) => ({
      cartPendingItemIds: { ...state.cartPendingItemIds, [item.variantId]: true },
    }))
    const result = await requestCart('/api/v1/cart/items', {
      method: 'POST',
      body: JSON.stringify({
        variantId: item.variantId,
        quantity,
      }),
    })
    if (!isCurrentCartScope(get, expectedOwner, expectedGeneration)) {
      clearPendingCartItem(set, item.variantId, expectedOperationVersion)
      return result.ok ? { ok: true } : result
    }
    if (
      !isCurrentCartOperation(
        get,
        expectedOwner,
        expectedGeneration,
        expectedOperationVersion,
      ) && hasNewerPendingOperation(expectedOperationVersion)
    ) {
      clearPendingCartItem(set, item.variantId, expectedOperationVersion)
      return result.ok ? { ok: true } : result
    }
    if (!result.ok) {
      set({
        cartItems: previousItems,
        cartLoading: false,
        cartError: result.message,
      })
      clearPendingCartItem(set, item.variantId, expectedOperationVersion)
      return result
    }
    if (result.cart.version <= get().cartVersion) {
      clearPendingCartItem(set, item.variantId, expectedOperationVersion)
      return { ok: true }
    }
    set(cartState(result.cart, get().cartItems))
    clearPendingCartItem(set, item.variantId, expectedOperationVersion)
    return { ok: true }
  },

  removeFromCart: async (id) => {
    const expectedOwner = get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration
    const expectedOperationVersion = ++cartOperationVersion
    cartItemOperationVersions.set(id, expectedOperationVersion)
    const previousItems = get().cartItems
    set({
      cartItems: previousItems.filter((item) => item.id !== id),
      cartLoading: true,
      cartError: null,
    })
    set((state) => ({
      cartPendingItemIds: { ...state.cartPendingItemIds, [id]: true },
    }))
    const result = await requestCart(`/api/v1/cart/items/${id}`, {
      method: 'DELETE',
    })
    if (!isCurrentCartScope(get, expectedOwner, expectedGeneration)) {
      clearPendingCartItem(set, id, expectedOperationVersion)
      return result.ok ? { ok: true } : result
    }
    if (
      !isCurrentCartOperation(
        get,
        expectedOwner,
        expectedGeneration,
        expectedOperationVersion,
      ) && hasNewerPendingOperation(expectedOperationVersion)
    ) {
      clearPendingCartItem(set, id, expectedOperationVersion)
      return result.ok ? { ok: true } : result
    }
    if (!result.ok) {
      set({
        cartItems: previousItems,
        cartLoading: false,
        cartError: result.message,
      })
      clearPendingCartItem(set, id, expectedOperationVersion)
      return result
    }
    if (result.cart.version <= get().cartVersion) {
      clearPendingCartItem(set, id, expectedOperationVersion)
      return { ok: true }
    }
    set(cartState(result.cart, get().cartItems))
    clearPendingCartItem(set, id, expectedOperationVersion)
    return { ok: true }
  },

  updateQuantity: async (id, quantity) => {
    const item = get().cartItems.find((cartItem) => cartItem.id === id)
    if (!item || quantity < 1 || quantity > 99 || quantity > item.availableQuantity) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Số lượng không hợp lệ hoặc vượt tồn kho.',
      }
    }

    const expectedOwner = get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration
    const expectedOperationVersion = ++cartOperationVersion
    cartItemOperationVersions.set(id, expectedOperationVersion)
    const previousItems = get().cartItems
    set({
      cartItems: previousItems.map((cartItem) =>
        cartItem.id === id ? { ...cartItem, quantity } : cartItem,
      ),
      cartLoading: true,
      cartError: null,
    })
    set((state) => ({
      cartPendingItemIds: { ...state.cartPendingItemIds, [id]: true },
    }))
    const result = await requestCart(`/api/v1/cart/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    if (!isCurrentCartScope(get, expectedOwner, expectedGeneration)) {
      clearPendingCartItem(set, id, expectedOperationVersion)
      return result.ok ? { ok: true } : result
    }
    if (
      !isCurrentCartOperation(
        get,
        expectedOwner,
        expectedGeneration,
        expectedOperationVersion,
      ) && hasNewerPendingOperation(expectedOperationVersion)
    ) {
      clearPendingCartItem(set, id, expectedOperationVersion)
      return result.ok ? { ok: true } : result
    }
    if (!result.ok) {
      set({
        cartItems: previousItems,
        cartLoading: false,
        cartError: result.message,
      })
      clearPendingCartItem(set, id, expectedOperationVersion)
      return result
    }
    if (result.cart.version <= get().cartVersion) {
      clearPendingCartItem(set, id, expectedOperationVersion)
      return { ok: true }
    }
    set(cartState(result.cart, get().cartItems))
    clearPendingCartItem(set, id, expectedOperationVersion)
    return { ok: true }
  },

  clearCartCache: () => {
    cartOperationVersion += 1
    cartItemOperationVersions.clear()
    set((state) => ({
      cartItems: [],
      cartId: null,
      cartVersion: 0,
      cartLoading: false,
      cartLoaded: false,
      cartError: null,
      cartPendingItemIds: {},
      cartCacheGeneration: state.cartCacheGeneration + 1,
    }))
  },
  getCartTotal: () =>
    get().cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ),
  getCartCount: () =>
    get().cartItems.reduce((count, item) => count + item.quantity, 0),
}))
