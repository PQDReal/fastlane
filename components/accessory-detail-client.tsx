'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CarFront,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Store,
  Wrench,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'

import { AccessoryCard } from '@/components/accessory-card'
import type { AccessoryCatalogItem } from '@/lib/cart/types'
import { accessoryFitmentStatus } from '@/lib/catalog/accessory-filters'
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
      <label className="mt-7 block">
        <span className="flex items-center justify-between gap-4 text-sm font-bold text-slate-900">
          <span>{group.name}{group.minimumSelections > 0 && <span className="text-red-500"> *</span>}</span>
          <span className="text-xs font-medium text-slate-400">Chọn 1</span>
        </span>
        <select
          value={selectedValue ?? ''}
          onChange={(event) => onChange(group.code, event.target.value)}
          className="mt-3 h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
    <fieldset className="mt-7">
      <legend className="flex w-full items-center justify-between gap-4 text-sm font-bold text-slate-900">
        <span>{group.name}{group.minimumSelections > 0 && <span className="text-red-500"> *</span>}</span>
        <span className="text-xs font-medium text-slate-400">Chọn 1</span>
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
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
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

function FitmentPassport({
  product,
  selectedVehicle,
}: {
  product: CatalogProduct
  selectedVehicle?: string
}) {
  const status = accessoryFitmentStatus(product, selectedVehicle)
  const models = product.content.compatibleModels
  const detailBase = `/accessories/${product.slug}`

  const presentation = status === 'compatible'
    ? {
        icon: CheckCircle2,
        eyebrow: 'Fitment đã xác nhận',
        title: `Phù hợp với ${selectedVehicle}`,
        description: 'Dòng xe này nằm trong dữ liệu tương thích của sản phẩm.',
        shell: 'border-emerald-200 bg-emerald-50',
        iconShell: 'bg-emerald-600 text-white',
        eyebrowClass: 'text-emerald-700',
      }
    : status === 'incompatible'
      ? {
          icon: XCircle,
          eyebrow: 'Fitment không khớp',
          title: `Chưa xác nhận cho ${selectedVehicle}`,
          description: 'Hãy đổi dòng xe hoặc liên hệ showroom trước khi đặt mua.',
          shell: 'border-red-200 bg-red-50',
          iconShell: 'bg-red-600 text-white',
          eyebrowClass: 'text-red-700',
        }
      : status === 'unknown'
        ? {
            icon: CircleHelp,
            eyebrow: 'Fitment cần kiểm tra',
            title: `Chưa có dữ liệu cho ${selectedVehicle}`,
            description: 'Sản phẩm không khai báo dòng xe cụ thể; showroom cần xác nhận.',
            shell: 'border-amber-200 bg-amber-50',
            iconShell: 'bg-amber-500 text-white',
            eyebrowClass: 'text-amber-800',
          }
        : {
            icon: CarFront,
            eyebrow: 'Garage passport',
            title: models.length > 0 ? 'Chọn xe để xác nhận fitment' : 'Fitment dùng chung / cần xác nhận',
            description: models.length > 0
              ? `Dữ liệu hiện có: ${models.join(', ')}.`
              : 'Sản phẩm chưa khai báo dòng xe cụ thể.',
            shell: 'border-brand-200 bg-brand-50',
            iconShell: 'bg-brand-600 text-white',
            eyebrowClass: 'text-brand-700',
          }
  const StatusIcon = presentation.icon

  return (
    <section className={`mt-6 rounded-xl border p-4 ${presentation.shell}`} aria-labelledby="fitment-heading">
      <div className="flex gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${presentation.iconShell}`}>
          <StatusIcon size={20} />
        </span>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${presentation.eyebrowClass}`}>
            {presentation.eyebrow}
          </p>
          <h2 id="fitment-heading" className="mt-1 font-bold text-slate-950">{presentation.title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{presentation.description}</p>
        </div>
      </div>

      {models.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-current/10 pt-4">
          {models.map((model) => (
            <Link
              key={model}
              href={`${detailBase}?vehicle=${encodeURIComponent(model)}`}
              className={`inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-bold transition ${
                selectedVehicle === model
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-white/80 bg-white/80 text-slate-700 hover:border-brand-400'
              }`}
            >
              {model}
            </Link>
          ))}
        </div>
      )}
    </section>
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
  const canPurchase = fitment !== 'incompatible'
  const listHref = selectedVehicle
    ? `/accessories?vehicle=${encodeURIComponent(selectedVehicle)}`
    : '/accessories'

  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-12 lg:py-12">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <Link href={listHref} className="inline-flex items-center gap-2 transition hover:text-brand-700">
            <ArrowLeft size={15} /> Phụ kiện
          </Link>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="max-w-[60vw] truncate text-slate-800">{product.name}</span>
        </nav>

        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(390px,5fr)] xl:gap-14">
          <section aria-label="Hình ảnh sản phẩm" className="min-w-0">
            <div className="relative mx-auto flex aspect-square w-full max-w-[600px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
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
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
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

            <div className="mt-7 grid grid-cols-3 border-y border-slate-200 bg-white">
              {[
                { icon: ShieldCheck, title: 'Chính hãng', detail: 'Nguồn VinFast' },
                { icon: PackageCheck, title: 'Theo tồn kho', detail: 'Cập nhật theo SKU' },
                { icon: Store, title: 'Showroom', detail: 'Theo nhãn dịch vụ' },
              ].map((item, index) => (
                <div key={item.title} className={`p-4 ${index > 0 ? 'border-l border-slate-200' : ''}`}>
                  <item.icon size={19} className="text-brand-600" />
                  <p className="mt-2 text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="h-fit lg:sticky lg:top-[98px]">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-brand-700">
              <span>{product.content.sourceCategory ?? 'Phụ kiện chính hãng'}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>{product.variants.length} cấu hình</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              {product.name}
            </h1>
            <p className="mt-3 font-mono text-xs text-slate-400">
              PART NO. {selectedVariant?.sku ?? 'CHỌN CẤU HÌNH'}
            </p>

            {product.description && (
              <p className="mt-5 line-clamp-3 text-sm leading-6 text-slate-600">{product.description}</p>
            )}

            {price !== undefined && (
              <div className="mt-6 flex flex-wrap items-end gap-3 border-y border-slate-200 py-5">
                <p className="text-3xl font-bold tracking-tight text-brand-700">
                  {formatPrice(price)}
                  {maximumPrice !== null && maximumPrice !== undefined && maximumPrice !== price
                    ? ` – ${formatPrice(maximumPrice)}`
                    : ''}
                </p>
                {selectedVariant && hasDiscount && (
                  <p className="mb-1 text-sm text-slate-400 line-through">
                    {formatPrice(selectedVariant.originalPrice)}
                  </p>
                )}
              </div>
            )}

            <FitmentPassport product={product} selectedVehicle={selectedVehicle} />

            {product.content.serviceLabels.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {product.content.serviceLabels.map((service) => (
                  <span key={service} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                    <Wrench size={14} className="text-brand-600" /> {service}
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

            <div className="mt-7 flex items-end justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-slate-900">Số lượng</p>
                <div className="mt-3 inline-flex items-center rounded-lg border border-slate-300 bg-white">
                  <button
                    type="button"
                    aria-label="Giảm số lượng"
                    disabled={!inStock || quantity <= 1}
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                    className="flex h-11 w-11 items-center justify-center text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-12 text-center font-bold tabular-nums text-slate-900">{quantity}</span>
                  <button
                    type="button"
                    aria-label="Tăng số lượng"
                    disabled={!inStock || quantity >= maximumQuantity}
                    onClick={() => setQuantity((current) => Math.min(maximumQuantity, current + 1))}
                    className="flex h-11 w-11 items-center justify-center text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="pb-2 text-right">
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
              className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-6 py-4 text-base font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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

            {product.content.policyNotes && (
              <div className="mt-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="whitespace-pre-line"><span className="font-bold">Lưu ý trước khi mua: </span>{product.content.policyNotes}</p>
              </div>
            )}
          </section>
        </div>

        <div className="mt-16 grid gap-8 border-t border-slate-200 pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(300px,5fr)] lg:gap-14">
          <section aria-labelledby="description-heading">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Product brief</p>
            <h2 id="description-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Câu chuyện sản phẩm</h2>
            {product.description ? (
              <p className="mt-6 whitespace-pre-line text-base leading-8 text-slate-600">{product.description}</p>
            ) : (
              <p className="mt-6 text-slate-500">Chưa có mô tả bổ sung cho sản phẩm này.</p>
            )}

            {product.content.specificationText && (
              <div className="mt-10 border-l-2 border-brand-500 pl-6">
                <h3 className="text-lg font-bold text-slate-950">Chi tiết sử dụng & kỹ thuật</h3>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">
                  {product.content.specificationText}
                </p>
              </div>
            )}
          </section>

          <aside className="h-fit rounded-xl border border-slate-200 bg-white p-6">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Part index</p>
            <dl className="mt-5 divide-y divide-slate-100 text-sm">
              <div className="grid grid-cols-[110px_1fr] gap-4 py-3">
                <dt className="text-slate-400">SKU</dt>
                <dd className="break-all font-mono font-semibold text-slate-900">{selectedVariant?.sku ?? 'Theo cấu hình'}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-4 py-3">
                <dt className="text-slate-400">Danh mục</dt>
                <dd className="font-semibold text-slate-900">{product.content.sourceCategory ?? product.category?.name ?? 'Phụ kiện'}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-4 py-3">
                <dt className="text-slate-400">Xe áp dụng</dt>
                <dd className="font-semibold text-slate-900">{product.content.compatibleModels.join(', ') || 'Cần xác nhận'}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-4 py-3">
                <dt className="text-slate-400">Tồn kho</dt>
                <dd className="font-semibold text-slate-900">{selectedVariant?.availableQuantity ?? product.availableQuantity}</dd>
              </div>
            </dl>
          </aside>
        </div>

        {Object.keys(product.content.specifications).length > 0 && (
          <section className="mt-14 border-t border-slate-200 pt-12" aria-labelledby="specifications-heading">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Technical sheet</p>
              <h2 id="specifications-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Thông số chi tiết</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">Thông tin được giữ nguyên theo dữ liệu công bố của sản phẩm.</p>
            </div>
            <dl className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid sm:grid-cols-2">
              {Object.entries(product.content.specifications).map(([key, value], index) => (
                <div key={key} className={`grid grid-cols-[minmax(110px,0.8fr)_1.2fr] gap-4 border-slate-100 p-5 text-sm ${index > 1 ? 'border-t' : ''} ${index % 2 === 1 ? 'sm:border-l' : ''} ${index === 1 ? 'border-t sm:border-t-0' : ''}`}>
                  <dt className="font-semibold text-slate-400">{key}</dt>
                  <dd className="leading-6 text-slate-900">{specificationValue(value)}</dd>
                </div>
              ))}
            </dl>
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
