'use client'

import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'

export function CartDrawer() {
  const { cartDrawerOpen, setCartDrawerOpen, cartItems, updateQuantity, removeFromCart, getCartTotal } = useAppStore()

  if (!cartDrawerOpen) return null

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setCartDrawerOpen(false)}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-5 w-5 text-[#836100]" />
            <h2 className="text-lg font-semibold text-gray-900">Giỏ hàng của bạn</h2>
          </div>
          <button
            onClick={() => setCartDrawerOpen(false)}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {cartItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-50">
                <ShoppingBag className="h-10 w-10 text-gray-300" />
              </div>
              <div>
                <p className="text-lg font-medium text-gray-900">Giỏ hàng trống</p>
                <p className="mt-1 text-sm text-gray-500">Hãy thêm sản phẩm vào giỏ hàng để tiếp tục.</p>
              </div>
              <button
                onClick={() => setCartDrawerOpen(false)}
                className="mt-6 rounded-full bg-[#836100] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6a4e00]"
              >
                Tiếp tục mua sắm
              </button>
            </div>
          ) : (
            <ul className="space-y-6">
              {cartItems.map((item) => (
                <li key={item.id} className="flex gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gray-50 p-2">
                    <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-gray-900 line-clamp-2">{item.name}</h4>
                        <button 
                          onClick={() => removeFromCart(item.id)}
                          className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">Mã: {item.sku}</p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center rounded-lg border border-gray-200">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors rounded-l-lg"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors rounded-r-lg"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="font-semibold text-[#836100]">{formatPrice(item.price)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-6">
            <div className="flex items-center justify-between text-base font-medium text-gray-900 mb-6">
              <p>Tổng cộng</p>
              <p className="text-xl text-[#836100]">{formatPrice(getCartTotal())}</p>
            </div>
            <Link
              href="/checkout"
              onClick={() => setCartDrawerOpen(false)}
              className="flex w-full items-center justify-center rounded-full bg-[#836100] px-6 py-4 text-base font-semibold text-white shadow-sm transition-all hover:bg-[#6a4e00] hover:shadow-md active:scale-[0.98]"
            >
              Tiến hành Thanh toán
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
