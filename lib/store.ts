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

function cartState(cart: ApiCart) {
  return {
    cartItems: mapApiCart(cart),
    cartId: cart.id,
    cartVersion: cart.version,
    cartLoaded: true,
    cartLoading: false,
    cartError: null,
  }
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
  cartOwnerSubject: null,
  cartCacheGeneration: 0,

  syncCartOwner: (subject) => {
    const normalizedSubject = subject?.trim() || null
    if (get().cartOwnerSubject === normalizedSubject) return false

    set((state) => ({
      cartItems: [],
      cartId: null,
      cartVersion: 0,
      cartLoading: false,
      cartLoaded: false,
      cartError: null,
      cartOwnerSubject: normalizedSubject,
      cartCacheGeneration: state.cartCacheGeneration + 1,
    }))
    return true
  },

  loadCart: async (ownerSubject) => {
    const expectedOwner = ownerSubject ?? get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration

    if (!expectedOwner || get().cartOwnerSubject !== expectedOwner) {
      return {
        ok: false,
        code: 'CART_OWNER_MISMATCH',
        message: 'Không thể tải giỏ hàng cho phiên tài khoản hiện tại.',
      }
    }

    set({ cartLoading: true, cartError: null })
    const result = await requestCart('/api/v1/cart')
    if (
      get().cartOwnerSubject !== expectedOwner ||
      get().cartCacheGeneration !== expectedGeneration
    ) {
      return { ok: true }
    }
    if (!result.ok) {
      set({ cartLoading: false, cartLoaded: true, cartError: result.message })
      return result
    }
    set(cartState(result.cart))
    return { ok: true }
  },

  addToCart: async (item, quantity = 1) => {
    const expectedOwner = get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration
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
    const result = await requestCart('/api/v1/cart/items', {
      method: 'POST',
      body: JSON.stringify({
        variantId: item.variantId,
        quantity,
      }),
    })
    if (
      get().cartOwnerSubject !== expectedOwner ||
      get().cartCacheGeneration !== expectedGeneration
    ) {
      return result.ok ? { ok: true } : result
    }
    if (!result.ok) {
      set({
        cartItems: previousItems,
        cartLoading: false,
        cartError: result.message,
      })
      return result
    }
    set(cartState(result.cart))
    return { ok: true }
  },

  removeFromCart: async (id) => {
    const expectedOwner = get().cartOwnerSubject
    const expectedGeneration = get().cartCacheGeneration
    const previousItems = get().cartItems
    set({
      cartItems: previousItems.filter((item) => item.id !== id),
      cartLoading: true,
      cartError: null,
    })
    const result = await requestCart(`/api/v1/cart/items/${id}`, {
      method: 'DELETE',
    })
    if (
      get().cartOwnerSubject !== expectedOwner ||
      get().cartCacheGeneration !== expectedGeneration
    ) {
      return result.ok ? { ok: true } : result
    }
    if (!result.ok) {
      set({
        cartItems: previousItems,
        cartLoading: false,
        cartError: result.message,
      })
      return result
    }
    set(cartState(result.cart))
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
    const previousItems = get().cartItems
    set({
      cartItems: previousItems.map((cartItem) =>
        cartItem.id === id ? { ...cartItem, quantity } : cartItem,
      ),
      cartLoading: true,
      cartError: null,
    })
    const result = await requestCart(`/api/v1/cart/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    if (
      get().cartOwnerSubject !== expectedOwner ||
      get().cartCacheGeneration !== expectedGeneration
    ) {
      return result.ok ? { ok: true } : result
    }
    if (!result.ok) {
      set({
        cartItems: previousItems,
        cartLoading: false,
        cartError: result.message,
      })
      return result
    }
    set(cartState(result.cart))
    return { ok: true }
  },

  clearCartCache: () =>
    set((state) => ({
      cartItems: [],
      cartId: null,
      cartVersion: 0,
      cartLoading: false,
      cartLoaded: false,
      cartError: null,
      cartCacheGeneration: state.cartCacheGeneration + 1,
    })),
  getCartTotal: () =>
    get().cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ),
  getCartCount: () =>
    get().cartItems.reduce((count, item) => count + item.quantity, 0),
}))
