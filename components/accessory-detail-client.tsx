'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'

import { AccessoryCard } from '@/components/accessory-card'
import type { AccessoryCatalogItem } from '@/lib/cart/types'
import {
  accessoryFitmentStatus,
  accessoryPrimaryCategoryLabel,
} from '@/lib/catalog/accessory-filters'
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
import { useAppStore } from '@/lib/store'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

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
    attributes: Object.fromEntries(
      variant.selectedOptionDetails.map((option) => [
        option.groupName,
        option.valueName,
      ]),
    ),
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
        width={28}
        height={28}
        className="h-7 w-7 rounded-md border border-black/10 object-cover"
      />
    )
  }
  if (value.colorHex) {
    return (
      <span
        aria-hidden="true"
        className="h-7 w-7 rounded-md border border-black/10"
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
      <label className="mt-5 block">
        <span className="flex items-center justify-between gap-4 text-sm font-bold text-slate-900">
          <span>{group.name}{group.minimumSelections > 0 && <span className="text-red-500"> *</span>}</span>
          <span className="text-xs font-medium text-slate-400">Chọn 1</span>
        </span>
        <select
          value={selectedValue ?? ''}
          onChange={(event) => onChange(group.code, event.target.value)}
          className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
    <fieldset className="mt-5">
      <legend className="flex w-full items-center justify-between gap-4 text-sm font-bold text-slate-900">
        <span>{group.name}{group.minimumSelections > 0 && <span className="text-red-500"> *</span>}</span>
        <span className="text-xs font-medium text-slate-400">Chọn 1</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
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
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                selected
                  ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-100'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
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
      width={960}
      height={960}
      loading={thumbnail ? 'lazy' : 'eager'}
      decoding="async"
      className="h-full w-full object-contain"
    />
  )
}

export function AccessoryDetailClient({
  product,
  initialVariantId,
  selectedVehicle,
  relatedProducts = [],
}: {
  product: CatalogProduct
  initialVariantId?: string
  selectedVehicle?: string
  relatedProducts?: CatalogProduct[]
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

  const handleAdd = async () => {
    if (!selectedVariant || !inStock || submitting) return
    setSubmitting(true)
    setFeedback(null)
    const result = await addToCart(
      cartItem(product, selectedVariant, selectedMedia),
      quantity,
    )
    setSubmitting(false)

    if (!result.ok) {
      if (result.code === 'AUTHENTICATION_REQUIRED') {
        const detailParams = new URLSearchParams()
        if (selectedVehicle) detailParams.set('vehicle', selectedVehicle)
        const detailQuery = detailParams.toString()
        const returnTo = `/accessories/${product.slug}${detailQuery ? `?${detailQuery}` : ''}`
        window.location.assign(
          `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
        )
        return
      }
      setFeedback({ type: 'error', message: result.message })
      return
    }

    setFeedback({ type: 'success', message: 'Đã thêm sản phẩm vào giỏ hàng.' })
  }

  const showPreviousMedia = () => setSelectedMediaIndex((current) => (
    current === 0 ? selectedMedia.length - 1 : current - 1
  ))
  const showNextMedia = () => setSelectedMediaIndex((current) => (
    current >= selectedMedia.length - 1 ? 0 : current + 1
  ))
  const price = selectedVariant?.effectivePrice ?? product.priceRange?.minimum
  const maximumPrice = selectedVariant ? null : product.priceRange?.maximum
  const hasDiscount = Boolean(
    selectedVariant?.salePrice !== null
    && selectedVariant?.salePrice !== undefined
    && selectedVariant.salePrice < selectedVariant.originalPrice,
  )
  const maximumQuantity = Math.min(99, selectedVariant?.availableQuantity ?? 0)
  const fitment = accessoryFitmentStatus(product, selectedVehicle)
  const primaryCategory = accessoryPrimaryCategoryLabel(product)
  const canPurchase = fitment !== 'incompatible'
  const listHref = selectedVehicle
    ? `/accessories?vehicle=${encodeURIComponent(selectedVehicle)}`
    : '/accessories'

  return (
    <>
      <div className="mx-auto w-full max-w-[1720px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12 xl:px-10">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <Link href={listHref} className="inline-flex items-center gap-2 transition hover:text-brand-700">
            <ArrowLeft size={15} /> Phụ kiện
          </Link>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="max-w-[60vw] truncate text-slate-800">{product.name}</span>
        </nav>

        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:gap-10">
          <section aria-label="Hình ảnh sản phẩm" className="min-w-0">
            <div className="relative flex aspect-square w-full max-w-[520px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="absolute left-4 top-4 z-10 rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500 backdrop-blur">
                Media {String(selectedMediaIndex + 1).padStart(2, '0')} / {String(selectedMedia.length).padStart(2, '0')}
              </div>
              {activeMedia && <MediaPreview media={activeMedia} productName={product.name} />}
              {selectedMedia.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Ảnh trước"
                    onClick={showPreviousMedia}
                    className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-400"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label="Ảnh sau"
                    onClick={showNextMedia}
                    className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-400"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {selectedMedia.length > 1 && (
              <div className="mt-4 flex max-w-[520px] gap-3 overflow-x-auto pb-2">
                {selectedMedia.map((media, index) => (
                  <button
                    key={`${media.url}-${index}`}
                    type="button"
                    aria-label={`Xem media ${index + 1}`}
                    aria-current={selectedMediaIndex === index ? 'true' : undefined}
                    onClick={() => setSelectedMediaIndex(index)}
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-white p-2 transition ${selectedMediaIndex === index ? 'border-brand-600 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-400'}`}
                  >
                    <MediaPreview media={media} productName={product.name} thumbnail />
                  </button>
                ))}
              </div>
            )}

          </section>

          <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(280px,1fr)_minmax(320px,390px)] xl:gap-10">
            <section aria-labelledby="product-heading" className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-brand-700">
                <span>{primaryCategory ?? 'Phụ kiện chính hãng'}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{product.variants.length} cấu hình</span>
              </div>
              <h1 id="product-heading" className="mt-3 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
                {product.name}
              </h1>
              <p className="mt-3 font-mono text-xs text-slate-400">
                PART NO. {selectedVariant?.sku ?? 'CHỌN CẤU HÌNH'}
              </p>

              {product.description && (
                <div className="mt-6">
                  <h2 className="text-base font-bold text-slate-950">Mô tả sản phẩm</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{product.description}</p>
                </div>
              )}

            </section>

            <section
              aria-label="Cấu hình và mua hàng"
              className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-[98px]"
            >
              <div className="border-b border-slate-200 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Giá bán</p>
                <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                  <p className="text-2xl font-bold tracking-tight text-brand-700">
                    {price === undefined ? 'Liên hệ' : formatPrice(price)}
                    {price !== undefined && maximumPrice !== null && maximumPrice !== undefined && maximumPrice !== price
                      ? ` – ${formatPrice(maximumPrice)}`
                      : ''}
                  </p>
                  {selectedVariant && hasDiscount && (
                    <p className="mb-0.5 text-xs text-slate-400 line-through">
                      {formatPrice(selectedVariant.originalPrice)}
                    </p>
                  )}
                </div>
              </div>

              {product.serviceLabels.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.serviceLabels.map((service) => (
                    <span key={service.id} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                      <Wrench size={14} className="text-brand-600" /> {service.name}
                    </span>
                  ))}
                </div>
              )}

              {product.optionGroups.map((group) => (
                <OptionGroup
                  key={group.id}
                  group={group}
                  selectedValue={selection[group.code]}
                  availability={availability[group.code] ?? {}}
                  onChange={changeOption}
                />
              ))}

              <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">Số lượng</p>
                  <div className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white">
                    <button
                      type="button"
                      aria-label="Giảm số lượng"
                      disabled={!inStock || quantity <= 1}
                      onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                      className="flex h-10 w-9 items-center justify-center text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-slate-900">{quantity}</span>
                    <button
                      type="button"
                      aria-label="Tăng số lượng"
                      disabled={!inStock || quantity >= maximumQuantity}
                      onClick={() => setQuantity((current) => Math.min(maximumQuantity, current + 1))}
                      className="flex h-10 w-9 items-center justify-center text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
                <div className="pb-1 text-right">
                  <p className={`text-sm font-bold ${inStock ? 'text-emerald-700' : 'text-red-600'}`}>
                    {!selectedVariant
                      ? 'Chưa chọn đủ cấu hình'
                      : inStock
                        ? `Còn ${selectedVariant.availableQuantity} sản phẩm`
                        : 'Tạm hết hàng'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Tối đa 99 / đơn</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedVariant || !inStock || !canPurchase || submitting}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
                {submitting
                  ? 'Đang thêm...'
                  : !canPurchase
                    ? 'Đổi xe hoặc xác nhận với showroom'
                    : !selectedVariant
                      ? 'Chọn đầy đủ cấu hình'
                      : inStock
                        ? 'Thêm vào giỏ hàng'
                        : 'Tạm hết hàng'}
              </button>

            {feedback && (
              <div role="status" className={`mt-4 rounded-lg px-4 py-3 text-sm ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                <div className="flex items-center gap-2">
                  {feedback.type === 'success' && <Check size={17} />}
                  <span>{feedback.message}</span>
                  {feedback.type === 'success' && <Link href="/cart" className="ml-auto font-bold underline">Xem giỏ hàng</Link>}
                </div>
              </div>
            )}

            </section>
          </div>
        </div>

        {product.content.sections.length > 0 && (
          <section className="mt-14 border-t border-slate-200 pt-10" aria-labelledby="content-heading">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Thông tin sản phẩm</p>
            <h2 id="content-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Chi tiết sử dụng &amp; kỹ thuật
            </h2>
            <div className="mt-7 grid gap-5 lg:grid-cols-2">
              {product.content.sections.map((section) => (
                <article key={section.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-base font-bold text-slate-950">{section.title}</h3>
                  {section.body && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{section.body}</p>
                  )}
                  {section.items.length > 0 && (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                      {section.items.map((item, index) => (
                        <li key={`${section.key}-item-${index}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {section.attributes.length > 0 && (
                    <dl className="mt-3 divide-y divide-slate-200">
                      {section.attributes.map((attribute, index) => (
                        <div key={`${section.key}-attribute-${index}`} className="grid grid-cols-[minmax(110px,0.8fr)_1.2fr] gap-4 py-2.5 text-sm">
                          <dt className="font-semibold text-slate-500">{attribute.label}</dt>
                          <dd className="text-slate-900">{attribute.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {relatedProducts.length > 0 && (
          <section className="mt-16 border-t border-slate-200 pt-12" aria-labelledby="related-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Cùng ngữ cảnh</p>
                <h2 id="related-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                  {selectedVehicle ? `Khám phá thêm cho ${selectedVehicle}` : 'Phụ kiện liên quan'}
                </h2>
              </div>
              <Link href={listHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900">
                Xem danh sách <ChevronRight size={17} />
              </Link>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((item) => (
                <AccessoryCard key={item.id} product={item} selectedVehicle={selectedVehicle} />
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_35px_-20px_rgba(15,23,42,0.5)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-400">{selectedVariant?.sku ?? 'Chọn cấu hình'}</p>
            <p className="truncate text-base font-bold text-brand-700">{price === undefined ? 'Liên hệ' : formatPrice(price)}</p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedVariant || !inStock || !canPurchase || submitting}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {submitting ? <Loader2 size={17} className="animate-spin" /> : <ShoppingCart size={17} />}
            Thêm vào giỏ
          </button>
        </div>
      </div>
    </>
  )
}
