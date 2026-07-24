'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Heart, Loader2, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import type { AccessoryCatalogItem, AccessoryCatalogProduct } from '@/lib/cart/types'
import { useAppStore } from '@/lib/store'
import { Button } from './ui/button'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

const colorValues: Array<[string[], string]> = [
  [['xanh la', 'green'], '#2f9e44'],
  [['xanh duong', 'xanh bien', 'blue', 'xanh'], '#1689e8'],
  [['den', 'black'], '#171717'],
  [['trang', 'white'], '#ffffff'],
  [['do', 'red'], '#e03131'],
  [['vang', 'yellow'], '#f5c542'],
  [['cam', 'orange'], '#f08c00'],
  [['hong', 'pink'], '#f783ac'],
  [['tim', 'purple'], '#7950f2'],
  [['nau', 'brown'], '#8b5e3c'],
  [['beige', 'be'], '#d9c7a5'],
  [['bac', 'silver'], '#adb5bd'],
  [['xam', 'gray', 'grey'], '#868e96'],
]

function getColorOption(attributes: Record<string, string>) {
  const entry = Object.entries(attributes).find(([key]) => /^(color|màu|mau)$/i.test(key.trim()))
  if (!entry) return null

  const label = String(entry[1])
  const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
  const color = colorValues.find(([names]) => names.some((name) => normalizedLabel.includes(name)))?.[1]
  return color ? { label, color } : null
}

function optionLabel(variant: AccessoryCatalogItem) {
  const attributeValues = Object.values(variant.attributes).filter(Boolean)
  return attributeValues.join(' / ') || variant.variantName
}

export function AccessoryCard({ product }: { product: AccessoryCatalogProduct }) {
  const { addToCart } = useAppStore()
  const initialIndex = Math.max(0, product.variants.findIndex((variant) => variant.availableQuantity > 0))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const selected = product.variants[selectedIndex]
  const hasOptions = product.variants.length > 1
  const inStock = Boolean(selected && selected.availableQuantity > 0)
  const detailHref = selected
    ? `/accessories/${product.productSlug}?variant=${encodeURIComponent(selected.sku)}`
    : `/accessories/${product.productSlug}`

  const selectOption = (index: number) => {
    setSelectedIndex(index)
    setFeedback(null)
  }

  const selectRelative = (offset: number) => {
    if (!hasOptions) return
    selectOption((selectedIndex + offset + product.variants.length) % product.variants.length)
  }

  const handleAddToCart = async () => {
    if (!selected || !inStock || submitting) return

    setSubmitting(true)
    setFeedback(null)
    const result = await addToCart(selected, 1)
    setSubmitting(false)

    if (!result.ok) {
      if (result.code === 'AUTHENTICATION_REQUIRED') {
        window.location.assign(
          `/auth/login?returnTo=${encodeURIComponent(detailHref)}`,
        )
        return
      }
      setFeedback(result.message)
      return
    }

    setFeedback('Đã thêm vào giỏ hàng')
  }

  if (!selected) return null

  return (
    <article className="group relative flex h-full flex-col pb-4 transition-all duration-500">
      {selected.discount !== null && (
        <div className="absolute left-4 top-4 z-20 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          -{selected.discount}%
        </div>
      )}
      <button
        type="button"
        aria-label={`Yêu thích ${product.name}`}
        className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-white hover:text-red-500"
      >
        <Heart size={16} />
      </button>

      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-transparent">
        <img
          src={selected.image || product.image}
          alt={`${product.name} - ${optionLabel(selected)}`}
          className="relative z-10 h-full w-full object-contain drop-shadow-md transition-transform duration-700 group-hover:scale-105"
        />

        {hasOptions && (
          <>
            <button type="button" aria-label={`Option trước của ${product.name}`} onClick={() => selectRelative(-1)} className="absolute left-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-brand-500/60 bg-white/90 text-brand-600 shadow-sm transition-colors hover:bg-white">
              <ChevronLeft size={22} />
            </button>
            <button type="button" aria-label={`Option tiếp theo của ${product.name}`} onClick={() => selectRelative(1)} className="absolute right-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-brand-500/60 bg-white/90 text-brand-600 shadow-sm transition-colors hover:bg-white">
              <ChevronRight size={22} />
            </button>
          </>
        )}

        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Button asChild variant="outline" className="h-10 translate-y-4 rounded-full border-none bg-white/95 px-6 text-sm font-semibold shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 hover:bg-white">
            <Link href={detailHref} aria-label={`Xem ${product.name}`}>
              <Eye size={16} className="mr-2" /> Xem
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-6">
        {hasOptions && (
          <div className="mb-4 flex min-h-9 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={`Các option của ${product.name}`}>
            {product.variants.map((variant, index) => {
              const color = getColorOption(variant.attributes)
              const selectedOption = index === selectedIndex
              const label = optionLabel(variant)

              return (
                <button
                  key={variant.variantId}
                  type="button"
                  title={`${label}${variant.availableQuantity > 0 ? '' : ' — Hết hàng'}`}
                  aria-label={`Chọn ${label}${variant.availableQuantity > 0 ? '' : ', hết hàng'}`}
                  aria-pressed={selectedOption}
                  onClick={() => selectOption(index)}
                  className={`relative shrink-0 transition-all ${color ? 'h-8 w-8 rounded-md p-[3px]' : 'h-8 rounded-full px-3 text-xs font-semibold'} ${selectedOption ? 'ring-2 ring-brand-600 ring-offset-2' : 'border border-muted hover:border-brand-400'} ${variant.availableQuantity > 0 ? '' : 'opacity-45'}`}
                >
                  {color ? (
                    <span className="block h-full w-full rounded-[3px] border border-black/10" style={{ backgroundColor: color.color }} />
                  ) : label}
                  {variant.availableQuantity <= 0 && <span className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-red-500" />}
                </button>
              )
            })}
          </div>
        )}

        <h3 className="mb-2 line-clamp-2 text-lg font-bold tracking-tight text-foreground">
          <Link href={detailHref} className="transition-colors hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">Mã: {selected.sku}</p>

        <div className="mb-4 mt-auto flex items-end gap-3">
          <p className="text-xl font-bold text-brand-700">{formatPrice(selected.priceAmount)}</p>
          {selected.oldPriceAmount !== null && (
            <p className="mb-0.5 text-sm font-medium text-muted-foreground line-through">{formatPrice(selected.oldPriceAmount)}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {inStock ? `Còn ${selected.availableQuantity}` : 'Hết hàng'}
            </span>
          </div>

          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label={`Thêm ${selected.name} vào giỏ hàng`}
            className="h-10 w-10 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
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
