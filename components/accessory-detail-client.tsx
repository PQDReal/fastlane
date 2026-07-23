'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronLeft, Loader2, Minus, Plus, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import type { AccessoryDetailData } from '@/lib/cart/types'
import { useAppStore } from '@/lib/store'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

function specificationValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) return value.map(specificationValue).join(', ')
  return JSON.stringify(value)
}

export function AccessoryDetailClient({ product }: { product: AccessoryDetailData }) {
  const { addToCart } = useAppStore()
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.variantId || '')
  const [selectedImage, setSelectedImage] = useState(product.images[0] || '/images/vf8.png')
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const selectedVariant = useMemo(
    () => product.variants.find((variant) => variant.variantId === selectedVariantId) || product.variants[0],
    [product.variants, selectedVariantId],
  )
  const inStock = Boolean(selectedVariant && selectedVariant.availableQuantity > 0)

  const changeVariant = (variantId: string) => {
    setSelectedVariantId(variantId)
    setQuantity(1)
    setFeedback(null)
  }

  const handleAdd = async () => {
    if (!selectedVariant || !inStock || submitting) return
    setSubmitting(true)
    setFeedback(null)
    const result = await addToCart(selectedVariant, quantity)
    setSubmitting(false)

    if (!result.ok) {
      if (result.code === 'AUTHENTICATION_REQUIRED') {
        window.location.assign(
          `/auth/login?returnTo=${encodeURIComponent(`/accessories/${product.slug}`)}`,
        )
        return
      }
      setFeedback({ type: 'error', message: result.message })
      return
    }

    setFeedback({ type: 'success', message: 'Đã thêm sản phẩm vào giỏ hàng.' })
  }

  if (!selectedVariant) return null

  return (
    <>
      <div className="mx-auto w-full max-w-[1320px] px-5 py-10 lg:px-10 lg:py-14">
        <Link href="/accessories" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#836100]">
          <ChevronLeft size={17} /> Quay lại danh sách phụ kiện
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
          <section>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
              <img src={selectedImage} alt={product.name} className="h-full w-full object-contain" />
            </div>
            {product.images.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {product.images.map((image) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setSelectedImage(image)}
                    className={`h-20 w-20 shrink-0 rounded-xl border bg-white p-2 ${selectedImage === image ? 'border-[#836100] ring-2 ring-[#836100]/15' : 'border-slate-200'}`}
                  >
                    <img src={image} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="h-fit lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#836100]">Phụ kiện chính hãng</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{product.name}</h1>
            <p className="mt-3 text-sm text-slate-500">Mã sản phẩm: {selectedVariant.sku}</p>

            <div className="mt-7 flex items-end gap-3">
              <p className="text-3xl font-bold text-[#836100]">{formatPrice(selectedVariant.priceAmount)}</p>
              {selectedVariant.oldPriceAmount !== null && (
                <p className="mb-1 text-base text-slate-400 line-through">{formatPrice(selectedVariant.oldPriceAmount)}</p>
              )}
            </div>

            <div className="mt-5 flex items-center gap-2 text-sm font-semibold">
              <span className={`h-2.5 w-2.5 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={inStock ? 'text-green-700' : 'text-red-600'}>
                {inStock ? `Còn ${selectedVariant.availableQuantity} sản phẩm` : 'Hết hàng'}
              </span>
            </div>

            {product.variants.length > 1 && (
              <div className="mt-8">
                <p className="text-sm font-bold text-slate-800">Phiên bản</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.variantId}
                      type="button"
                      onClick={() => changeVariant(variant.variantId)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${variant.variantId === selectedVariant.variantId ? 'border-[#836100] bg-[#836100]/10 text-[#836100]' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
                    >
                      {variant.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8">
              <p className="text-sm font-bold text-slate-800">Số lượng</p>
              <div className="mt-3 inline-flex items-center rounded-xl border border-slate-200 bg-white">
                <button type="button" aria-label="Giảm số lượng" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="flex h-11 w-11 items-center justify-center text-slate-500 disabled:opacity-30">
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center font-bold text-slate-900">{quantity}</span>
                <button type="button" aria-label="Tăng số lượng" disabled={quantity >= Math.min(99, selectedVariant.availableQuantity)} onClick={() => setQuantity((current) => Math.min(selectedVariant.availableQuantity, current + 1))} className="flex h-11 w-11 items-center justify-center text-slate-500 disabled:opacity-30">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <button type="button" onClick={handleAdd} disabled={!inStock || submitting} className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#836100] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
              {submitting ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
            </button>

            {feedback && (
              <div role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <div className="flex items-center gap-2">
                  {feedback.type === 'success' && <Check size={17} />}
                  <span>{feedback.message}</span>
                  {feedback.type === 'success' && <Link href="/cart" className="ml-auto font-bold underline">Xem giỏ hàng</Link>}
                </div>
              </div>
            )}

            {product.description && (
              <div className="mt-8 border-t border-slate-200 pt-7">
                <h2 className="text-lg font-bold text-slate-900">Mô tả sản phẩm</h2>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-600">{product.description}</p>
              </div>
            )}
          </section>
        </div>

        {Object.keys(product.specifications).length > 0 && (
          <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <h2 className="text-2xl font-bold text-slate-900">Thông tin chi tiết</h2>
            <dl className="mt-6 grid gap-x-10 sm:grid-cols-2">
              {Object.entries(product.specifications).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(120px,0.8fr)_1.2fr] gap-4 border-b border-slate-100 py-4 text-sm">
                  <dt className="font-semibold text-slate-500">{key}</dt>
                  <dd className="text-slate-900">{specificationValue(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </>
  )
}
