'use client'

import { useState } from 'react'
import { Eye, Heart, Loader2, ShoppingCart, Star } from 'lucide-react'
import Link from 'next/link'

import type { AccessoryCatalogItem } from '@/lib/cart/types'
import { useAppStore } from '@/lib/store'
import { Button } from './ui/button'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

export function AccessoryCard(item: AccessoryCatalogItem) {
  const { addToCart } = useAppStore()
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const inStock = item.availableQuantity > 0

  const handleAddToCart = async () => {
    if (!inStock || submitting) return

    setSubmitting(true)
    setFeedback(null)
    const result = await addToCart(item, 1)
    setSubmitting(false)

    if (!result.ok) {
      if (result.code === 'AUTHENTICATION_REQUIRED') {
        window.location.assign(
          `/auth/login?returnTo=${encodeURIComponent('/accessories')}`,
        )
        return
      }
      setFeedback(result.message)
      return
    }

    setFeedback('Đã thêm vào giỏ hàng')
  }

  return (
    <article className="group flex flex-col h-full transition-all duration-500 relative pb-4">
      {item.discount !== null && (
        <div className="absolute top-4 left-4 z-20 bg-brand-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
          -{item.discount}%
        </div>
      )}
      <button
        type="button"
        aria-label={`Yêu thích ${item.name}`}
        className="absolute top-4 right-4 z-20 h-8 w-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-white transition-colors shadow-sm"
      >
        <Heart size={16} />
      </button>

      <div className="relative aspect-square w-full bg-transparent flex items-center justify-center overflow-hidden">
        <img src={item.image} alt={item.name} className="relative z-10 w-full h-full object-contain transition-transform duration-700 group-hover:scale-110 drop-shadow-md" />

        <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
          <Button asChild variant="outline" className="bg-white/95 backdrop-blur-sm border-none shadow-sm hover:bg-white text-sm font-semibold rounded-full px-6 h-10 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
            <Link href={`/accessories/${item.productSlug}`}>
              <Eye size={16} className="mr-2" /> Xem chi tiết
            </Link>
          </Button>
        </div>
      </div>

      <div className="pt-6 flex flex-col flex-1">
        <div className="flex items-center gap-1 mb-3">
          {[...Array(5)].map((_, index) => (
            <Star key={index} size={12} className={index < Math.floor(item.rating) ? 'fill-brand-500 text-brand-500' : 'fill-muted text-muted'} />
          ))}
          <span className="text-xs text-muted-foreground ml-2 font-medium">{item.rating}</span>
        </div>

        <h3 className="text-lg font-bold tracking-tight text-foreground line-clamp-2 mb-2">
          <Link href={`/accessories/${item.productSlug}`} className="hover:text-brand-700 transition-colors">
            {item.name}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground mb-3">Mã: {item.sku}</p>

        <div className="flex items-end gap-3 mt-auto mb-4">
          <p className="text-xl font-bold text-brand-700">{formatPrice(item.priceAmount)}</p>
          {item.oldPriceAmount !== null && (
            <p className="text-sm font-medium text-muted-foreground line-through mb-0.5">{formatPrice(item.oldPriceAmount)}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {inStock ? `Còn ${item.availableQuantity}` : 'Hết hàng'}
            </span>
          </div>

          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label={`Thêm ${item.name} vào giỏ hàng`}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-full h-10 w-10 shrink-0"
            disabled={!inStock || submitting}
            onClick={handleAddToCart}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
          </Button>
        </div>
        <p aria-live="polite" className={`mt-3 min-h-5 text-xs ${feedback === 'Đã thêm vào giỏ hàng' ? 'text-green-700' : 'text-red-600'}`}>
          {feedback}
          {feedback === 'Đã thêm vào giỏ hàng' && (
            <Link href="/cart" className="ml-2 font-bold underline underline-offset-2">
              Xem giỏ hàng
            </Link>
          )}
        </p>
      </div>
    </article>
  )
}
