'use client'

import { type MouseEvent, useMemo, useState } from 'react'
import { Check, ChevronLeft, Loader2, Minus, Plus, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import {
  changeOptionSelection,
  getOptionAvailability,
  resolveCatalogMedia,
  resolveExactVariant,
} from '@/lib/catalog/resolver'
import type {
  CatalogOptionAvailability,
  CatalogOptionGroup,
  CatalogOptionValue,
  CatalogProduct,
  CatalogResolvedMedia,
  CatalogSelection,
  CatalogVariant,
} from '@/lib/catalog/types'
import type { AccessoryCatalogItem } from '@/lib/cart/types'
import {
  cancelCartAnimation,
  launchCartAnimation,
  prepareCartAnimation,
} from '@/lib/cart/animation'
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

function initialVariant(product: CatalogProduct, initialVariantId?: string): CatalogVariant | null {
  return product.variants.find((variant) => variant.id === initialVariantId)
    ?? product.variants.find((variant) => variant.availableQuantity > 0)
    ?? product.variants[0]
    ?? null
}

function optionAvailability(
  product: CatalogProduct,
  selection: CatalogSelection,
): CatalogOptionAvailability {
  const result: CatalogOptionAvailability = {}
  const precedingSelection: CatalogSelection = {}

  for (const group of product.optionGroups) {
    result[group.code] = getOptionAvailability(product, precedingSelection)[group.code]
    const selectedValue = selection[group.code]
    if (group.values.some((value) => value.code === selectedValue)) {
      precedingSelection[group.code] = selectedValue
    }
  }
  return result
}

function cartItem(
  product: CatalogProduct,
  variant: CatalogVariant,
  images: CatalogResolvedMedia[],
): AccessoryCatalogItem {
  const hasDiscount = variant.salePrice !== null
    && variant.salePrice < variant.originalPrice
  const imageUrls = images
    .filter((media) => media.mediaType === 'IMAGE')
    .map((media) => media.url)
  const primaryImage = imageUrls[0] ?? '/images/vf8.png'
  return {
    productId: product.id,
    productSlug: product.slug,
    variantId: variant.id,
    sku: variant.sku,
    name: variant.name === 'Mặc định'
      ? product.name
      : `${product.name} - ${variant.name}`,
    variantName: variant.name,
    priceAmount: variant.effectivePrice,
    oldPriceAmount: hasDiscount ? variant.originalPrice : null,
    image: primaryImage,
    images: imageUrls.length > 0 ? imageUrls : [primaryImage],
    attributes: variant.selectedOptions,
    availableQuantity: variant.availableQuantity,
    discount: hasDiscount
      ? Math.round((1 - variant.effectivePrice / variant.originalPrice) * 100)
      : null,
  }
}

function Swatch({ value }: { value: CatalogOptionValue }) {
  if (value.swatchUrl) {
    return (
      <img
        src={value.swatchUrl}
        alt=""
        className="h-6 w-6 rounded-full border border-black/10 object-cover"
      />
    )
  }
  if (value.colorHex) {
    return (
      <span
        aria-hidden="true"
        className="h-6 w-6 rounded-full border border-black/10"
        style={{ backgroundColor: value.colorHex }}
      />
    )
  }
  return null
}

function OptionGroup({
  group,
  selectedValue,
  availability,
  onChange,
}: {
  group: CatalogOptionGroup
  selectedValue?: string
  availability: Record<string, boolean>
  onChange: (groupCode: string, valueCode: string) => void
}) {
  if (group.displayType === 'SELECT') {
    return (
      <label className="mt-8 block">
        <span className="text-sm font-bold text-slate-800">
          {group.name}{group.minimumSelections > 0 && <span className="text-red-500"> *</span>}
        </span>
        <select
          value={selectedValue ?? ''}
          onChange={(event) => onChange(group.code, event.target.value)}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#836100] focus:ring-2 focus:ring-[#836100]/15"
        >
          <option value="" disabled={group.minimumSelections > 0}>
            {group.minimumSelections > 0
              ? `Chọn ${group.name.toLocaleLowerCase('vi-VN')}`
              : `Không chọn ${group.name.toLocaleLowerCase('vi-VN')}`}
          </option>
          {group.values.map((value) => (
            <option
              key={value.id}
              value={value.code}
              disabled={!availability[value.code]}
            >
              {value.name}{!availability[value.code] ? ' — Không khả dụng' : ''}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <fieldset className="mt-8">
      <legend className="text-sm font-bold text-slate-800">
        {group.name}{group.minimumSelections > 0 && <span className="text-red-500"> *</span>}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {group.values.map((value) => {
          const selected = value.code === selectedValue
          const available = availability[value.code] ?? false
          return (
            <button
              key={value.id}
              type="button"
              disabled={!available}
              aria-pressed={selected}
              onClick={() => onChange(group.code, value.code)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                selected
                  ? 'border-[#836100] bg-[#836100]/10 text-[#836100] ring-2 ring-[#836100]/10'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {group.displayType === 'SWATCH' && <Swatch value={value} />}
              {value.name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function MediaPreview({ media, productName, thumbnail = false }: {
  media: CatalogResolvedMedia
  productName: string
  thumbnail?: boolean
}) {
  if (media.mediaType === 'VIDEO') {
    return (
      <video
        src={media.url}
        aria-label={media.altText ?? productName}
        className="h-full w-full object-contain"
        controls={!thumbnail}
        muted={thumbnail}
        playsInline
      />
    )
  }
  return (
    <img
      src={media.url}
      alt={media.altText ?? productName}
      className="h-full w-full object-contain"
    />
  )
}

export function AccessoryDetailClient({
  product,
  initialVariantId,
}: {
  product: CatalogProduct
  initialVariantId?: string
}) {
  const { addToCart } = useAppStore()
  const defaultVariant = initialVariant(product, initialVariantId)
  const [selection, setSelection] = useState<CatalogSelection>(
    () => defaultVariant?.selectedOptions ?? {},
  )
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const selectedVariant = useMemo(
    () => resolveExactVariant(product, selection),
    [product, selection],
  )
  const availability = useMemo(
    () => optionAvailability(product, selection),
    [product, selection],
  )
  const selectedMedia = useMemo(
    () => resolveCatalogMedia(product, {
      variantId: selectedVariant?.id,
      selectedOptions: selection,
    }),
    [product, selectedVariant?.id, selection],
  )
  const activeMedia = selectedMedia[selectedMediaIndex] ?? selectedMedia[0]
  const inStock = Boolean(selectedVariant && selectedVariant.availableQuantity > 0)
  const description = product.content.specificationText || product.description

  const changeOption = (groupCode: string, valueCode: string) => {
    setSelection((current) => changeOptionSelection(
      product,
      current,
      groupCode,
      valueCode,
    ))
    setSelectedMediaIndex(0)
    setQuantity(1)
    setFeedback(null)
  }

  const handleAdd = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!selectedVariant || !inStock || submitting) return
    const animationId = prepareCartAnimation(event.currentTarget)
    setSubmitting(true)
    setFeedback(null)
    const result = await addToCart(
      cartItem(product, selectedVariant, selectedMedia),
      quantity,
    )
    setSubmitting(false)

    if (!result.ok) {
      cancelCartAnimation(animationId)
      if (result.code === 'AUTHENTICATION_REQUIRED') {
        window.location.assign(
          `/auth/login?returnTo=${encodeURIComponent(`/accessories/${product.slug}`)}`,
        )
        return
      }
      setFeedback({ type: 'error', message: result.message })
      return
    }

    launchCartAnimation(animationId, quantity)
    setFeedback({ type: 'success', message: 'Đã thêm sản phẩm vào giỏ hàng.' })
  }

  const price = selectedVariant?.effectivePrice ?? product.priceRange?.minimum
  const maximumPrice = selectedVariant ? null : product.priceRange?.maximum
  const hasDiscount = Boolean(
    selectedVariant?.salePrice !== null
    && selectedVariant?.salePrice !== undefined
    && selectedVariant.salePrice < selectedVariant.originalPrice,
  )
  const maximumQuantity = Math.min(99, selectedVariant?.availableQuantity ?? 0)

  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-10 lg:px-10 lg:py-14">
      <Link href="/accessories" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#836100]">
        <ChevronLeft size={17} /> Quay lại danh sách phụ kiện
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        <section>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <MediaPreview media={activeMedia} productName={product.name} />
          </div>
          {selectedMedia.length > 1 && (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {selectedMedia.map((media, index) => (
                <button
                  key={`${media.url}-${index}`}
                  type="button"
                  aria-label={`Xem media ${index + 1}`}
                  onClick={() => setSelectedMediaIndex(index)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-white p-2 ${selectedMediaIndex === index ? 'border-[#836100] ring-2 ring-[#836100]/15' : 'border-slate-200'}`}
                >
                  <MediaPreview media={media} productName={product.name} thumbnail />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="h-fit lg:sticky lg:top-28">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#836100]">Phụ kiện chính hãng</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{product.name}</h1>
          <p className="mt-3 text-sm text-slate-500">
            Mã sản phẩm: {selectedVariant?.sku ?? 'Chọn đầy đủ tùy chọn'}
          </p>

          {price !== undefined && (
            <div className="mt-7 flex items-end gap-3">
              <p className="text-3xl font-bold text-[#836100]">
                {formatPrice(price)}
                {maximumPrice !== null && maximumPrice !== undefined && maximumPrice !== price
                  ? ` – ${formatPrice(maximumPrice)}`
                  : ''}
              </p>
              {selectedVariant && hasDiscount && (
                <p className="mb-1 text-base text-slate-400 line-through">
                  {formatPrice(selectedVariant.originalPrice)}
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={inStock ? 'text-green-700' : 'text-red-600'}>
              {!selectedVariant
                ? 'Vui lòng chọn đầy đủ tùy chọn'
                : inStock
                  ? `Còn ${selectedVariant.availableQuantity} sản phẩm`
                  : 'Hết hàng'}
            </span>
          </div>

          {product.optionGroups.map((group) => (
            <OptionGroup
              key={group.id}
              group={group}
              selectedValue={selection[group.code]}
              availability={availability[group.code] ?? {}}
              onChange={changeOption}
            />
          ))}

          <div className="mt-8">
            <p className="text-sm font-bold text-slate-800">Số lượng</p>
            <div className="mt-3 inline-flex items-center rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-label="Giảm số lượng"
                disabled={!inStock || quantity <= 1}
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="flex h-11 w-11 items-center justify-center text-slate-500 disabled:opacity-30"
              >
                <Minus size={16} />
              </button>
              <span className="w-12 text-center font-bold text-slate-900">{quantity}</span>
              <button
                type="button"
                aria-label="Tăng số lượng"
                disabled={!inStock || quantity >= maximumQuantity}
                onClick={() => setQuantity((current) => Math.min(maximumQuantity, current + 1))}
                className="flex h-11 w-11 items-center justify-center text-slate-500 disabled:opacity-30"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedVariant || !inStock || submitting}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#836100] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
            {submitting
              ? 'Đang thêm...'
              : !selectedVariant
                ? 'Chọn đầy đủ tùy chọn'
                : inStock
                  ? 'Thêm vào giỏ hàng'
                  : 'Hết hàng'}
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

          {description && (
            <div className="mt-8 border-t border-slate-200 pt-7">
              <h2 className="text-lg font-bold text-slate-900">Mô tả sản phẩm</h2>
              <p className="mt-3 whitespace-pre-line leading-7 text-slate-600">{description}</p>
            </div>
          )}
        </section>
      </div>

      {Object.keys(product.content.specifications).length > 0 && (
        <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <h2 className="text-2xl font-bold text-slate-900">Thông tin chi tiết</h2>
          <dl className="mt-6 grid gap-x-10 sm:grid-cols-2">
            {Object.entries(product.content.specifications).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[minmax(120px,0.8fr)_1.2fr] gap-4 border-b border-slate-100 py-4 text-sm">
                <dt className="font-semibold text-slate-500">{key}</dt>
                <dd className="text-slate-900">{specificationValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
