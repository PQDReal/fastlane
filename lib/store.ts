import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  id: string
  name: string
  price: number
  image: string
  quantity: number
  sku: string
}

interface AppState {
  // UI State
  searchModalOpen: boolean
  setSearchModalOpen: (open: boolean) => void
  cartDrawerOpen: boolean
  setCartDrawerOpen: (open: boolean) => void

  // Cart State
  cartItems: CartItem[]
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  removeFromCart: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  getCartTotal: () => number
  getCartCount: () => number
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // UI State
      searchModalOpen: false,
      setSearchModalOpen: (open) => set({ searchModalOpen: open }),
      cartDrawerOpen: false,
      setCartDrawerOpen: (open) => set({ cartDrawerOpen: open }),

      // Cart State
      cartItems: [],
      addToCart: (item, quantity = 1) => set((state) => {
        const existingItem = state.cartItems.find(i => i.id === item.id)
        if (existingItem) {
          return {
            cartItems: state.cartItems.map(i => 
              i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i
            )
          }
        }
        return { cartItems: [...state.cartItems, { ...item, quantity }] }
      }),
      removeFromCart: (id) => set((state) => ({
        cartItems: state.cartItems.filter(i => i.id !== id)
      })),
      updateQuantity: (id, quantity) => set((state) => ({
        cartItems: state.cartItems.map(i =>
          i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i
        )
      })),
      clearCart: () => set({ cartItems: [] }),
      getCartTotal: () => get().cartItems.reduce((total, item) => total + (item.price * item.quantity), 0),
      getCartCount: () => get().cartItems.reduce((count, item) => count + item.quantity, 0),
    }),
    {
      name: 'fastlane-storage',
      partialize: (state) => ({ cartItems: state.cartItems }), // Only persist cartItems
    }
  )
)
