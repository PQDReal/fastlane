'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'

import { accessoryFitmentStatus } from '@/lib/catalog/accessory-filters'
import {
  filterCompatibleVariants,
  resolveCatalogImageUrl,
  resolveCatalogMedia,
} from '@/lib/catalog/resolver'
import type {
  CatalogOptionGroup,
  CatalogOptionValue,
  CatalogProduct,
  CatalogResolvedMedia,
  CatalogSelection,
  CatalogVariant,
} from '@/lib/catalog/types'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

function primaryMediaOptionGroup(product: CatalogProduct): CatalogOptionGroup | null {
  return product.optionGroups.find((group) => (
    group.metadata.drivesMedia === true || group.metadata.primary === true
  )) ?? product.optionGroups.find((group) => (
    group.code === 'color'
    || group.code.endsWith('_color')
    || group.code.startsWith('color_')
  )) ?? product.optionGroups.find((group) => group.displayType === 'SWATCH')
    ?? null
}

function preferredVariant(
  product: CatalogProduct,
  selection: CatalogSelection = {},
): CatalogVariant | null {
  const candidates = filterCompatibleVariants(product.variants, selection)
  return candidates.find((variant) => variant.availableQuantity > 0)
    ?? candidates[0]
    ?? null
}

function initialMediaOptionValue(
  product: CatalogProduct,
  group: CatalogOptionGroup | null,
): string | null {
  if (!group) return null
  return group.values.find((value) => (
    filterCompatibleVariants(product.variants, { [group.code]: value.code })
      .some((variant) => variant.availableQuantity > 0)
  ))?.code ?? group.values.find((value) => (
    filterCompatibleVariants(product.variants, { [group.code]: value.code })
      .length > 0
  ))?.code ?? group.values[0]?.code ?? null
}

function priceLabel(product: CatalogProduct): string {
  if (!product.priceRange) return 'Liên hệ'
  if (product.priceRange.minimum === product.priceRange.maximum) {
    return formatPrice(product.priceRange.minimum)
  }
  return `Từ ${formatPrice(product.priceRange.minimum)}`
}

function galleryImages(
  product: CatalogProduct,
  variant: CatalogVariant | null,
  selectedOptions: CatalogSelection,
): CatalogResolvedMedia[] {
  const resolved = resolveCatalogMedia(product, {
    variantId: variant?.id,
    selectedOptions,
  }).filter((media) => media.mediaType === 'IMAGE')
  const seen = new Set<string>()
  const images = resolved.filter((media) => {
    if (seen.has(media.url)) return false
    seen.add(media.url)
    return true
  })

  if (images.length > 0) return images
  return [{
    url: resolveCatalogImageUrl(product, {
      variantId: variant?.id,
      selectedOptions,
    }),
    altText: product.name,
    mediaType: 'IMAGE',
    role: 'THUMBNAIL',
    source: 'PLACEHOLDER',
  }]
}

function VisualOptionSwatch({ value }: { value: CatalogOptionValue }) {
  if (value.colorHex) {
    return (
      <span
        aria-hidden="true"
        className="block h-full w-full rounded-md"
        style={{ backgroundColor: value.colorHex }}
      />
    )
  }

  if (value.swatchUrl) {
    return (
      <img
        src={value.swatchUrl}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        className="h-full w-full rounded-md object-cover"
      />
    )
  }

  return (
    <span className="grid h-full w-full place-items-center rounded-md bg-slate-100 text-[9px] font-bold uppercase text-slate-600">
      {value.name.slice(0, 2)}
    </span>
  )
}

function VisualOptionSelector({
  group,
  product,
  selectedValueCode,
  onSelect,
}: {
  group: CatalogOptionGroup
  product: CatalogProduct
  selectedValueCode: string | null
  onSelect: (valueCode: string) => void
}) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const strip = stripRef.current
    const button = selectedButtonRef.current
    if (!strip || !button) return
    const stripRect = strip.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const centeredOffset = buttonRect.left - stripRect.left
      - (strip.clientWidth - buttonRect.width) / 2
    strip.scrollTo({
      left: Math.max(0, strip.scrollLeft + centeredOffset),
      behavior: 'smooth',
    })
  }, [selectedValueCode])

  return (
    <div
      className="absolute inset-x-4 bottom-4 z-30 flex justify-center"
      role="group"
      aria-label={`${group.name} của ${product.name}`}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ touchAction: 'pan-x' }}
    >
      <div
        ref={stripRef}
        className="w-[240px] max-w-full cursor-default overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full justify-center gap-2 px-1 py-1">
          {group.values.map((value) => {
            const candidates = filterCompatibleVariants(product.variants, {
              [group.code]: value.code,
            })
            const hasMedia = (product.media.byOptionValue[value.id] ?? []).length > 0
            const selectable = candidates.length > 0 || hasMedia
            const inStock = candidates.some((variant) => variant.availableQuantity > 0)
            const selected = selectedValueCode === value.code

            return (
              <button
                key={value.id}
                ref={selected ? selectedButtonRef : undefined}
                type="button"
                title={`${value.name}${inStock ? '' : ' — Hết hàng'}`}
                aria-label={`Chọn ${group.name.toLocaleLowerCase('vi-VN')} ${value.name}${inStock ? '' : ', hết hàng'}`}
                aria-pressed={selected}
                disabled={!selectable}
                onClick={() => onSelect(value.code)}
                className={`relative h-10 w-10 shrink-0 rounded-lg border-2 bg-white p-[3px] transition disabled:cursor-not-allowed disabled:opacity-30 ${
                  selected
                    ? 'border-brand-600'
                    : 'border-slate-300 hover:border-brand-400'
                } ${inStock ? '' : 'opacity-55'}`}
              >
                <VisualOptionSwatch value={value} />
                {!inStock && (
                  <span aria-hidden="true" className="absolute inset-x-1 top-1/2 h-px -rotate-45 bg-red-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AccessoryImageCarousel({
  product,
  images,
  productName,
  detailHref,
  selectedVehicle,
  fitmentStatus,
  visualOptionGroup,
  selectedVisualValueCode,
  onSelectVisualValue,
}: {
  product: CatalogProduct
  images: CatalogResolvedMedia[]
  productName: string
  detailHref: string
  selectedVehicle?: string
  fitmentStatus: ReturnType<typeof accessoryFitmentStatus>
  visualOptionGroup: CatalogOptionGroup | null
  selectedVisualValueCode: string | null
  onSelectVisualValue: (valueCode: string) => void
}) {
  const multiple = images.length > 1
  const displayImages = useMemo(() => {
    if (!multiple) return images
    return [images[images.length - 1], ...images, images[0]]
  }, [images, multiple])

  const [activeIndex, setActiveIndex] = useState(multiple ? 1 : 0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(true)
  const isAnimating = useRef(false)
  const dragStart = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const signature = images.map((image) => image.url).join('|')

  useLayoutEffect(() => {
    setIsTransitioning(false)
    setActiveIndex(multiple ? 1 : 0)
    setDragOffset(0)
    isAnimating.current = false
    const frame = window.requestAnimationFrame(() => {
      setIsTransitioning(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [signature, multiple])

  const unlockAnimation = () => {
    window.setTimeout(() => {
      isAnimating.current = false
    }, 50)
  }

  const previous = () => {
    if (!multiple || isAnimating.current) return
    isAnimating.current = true
    setIsTransitioning(true)
    setActiveIndex((current) => current - 1)
  }

  const next = () => {
    if (!multiple || isAnimating.current) return
    isAnimating.current = true
    setIsTransitioning(true)
    setActiveIndex((current) => current + 1)
  }

  const handleTransitionEnd = () => {
    if (!multiple) return
    if (activeIndex === 0) {
      setIsTransitioning(false)
      setActiveIndex(images.length)
    } else if (activeIndex === displayImages.length - 1) {
      setIsTransitioning(false)
      setActiveIndex(1)
    }
    unlockAnimation()
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return
    const rawDistance = event.clientX - dragStart.current
    suppressClick.current = Math.abs(rawDistance) > 6
    if (Math.abs(rawDistance) >= 44 && !isAnimating.current) {
      isAnimating.current = true
      setIsTransitioning(true)
      if (rawDistance <= -44) setActiveIndex((current) => current + 1)
      else if (rawDistance >= 44) setActiveIndex((current) => current - 1)
    } else {
      setIsTransitioning(true)
      unlockAnimation()
    }
    dragStart.current = null
    setDragOffset(0)
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const currentDisplayIndex = multiple
    ? (((activeIndex - 1) % images.length + images.length) % images.length) + 1
    : 1

  const fitment = selectedVehicle
    ? fitmentStatus === 'compatible'
      ? { icon: CheckCircle2, label: `Phù hợp ${selectedVehicle}`, className: 'bg-emerald-600 text-white' }
      : fitmentStatus === 'incompatible'
        ? { icon: XCircle, label: `Chưa khớp ${selectedVehicle}`, className: 'bg-red-600 text-white' }
        : { icon: CircleHelp, label: `Kiểm tra ${selectedVehicle}`, className: 'bg-amber-500 text-white' }
    : null
  const FitmentIcon = fitment?.icon

  return (
    <div
      role="region"
      aria-label={`Ảnh ${productName}`}
      className={`group/gallery relative aspect-square overflow-hidden bg-[#f3f5f6] ${multiple ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ touchAction: multiple ? 'pan-y' : 'auto' }}
      onPointerDown={(event) => {
        if (!multiple || event.button !== 0 || (event.target as Element).closest('button')) return
        dragStart.current = event.clientX
      }}
      onPointerMove={(event) => {
        if (dragStart.current === null) return
        const limit = event.currentTarget.clientWidth * 0.35
        const distance = event.clientX - dragStart.current
        if (
          Math.abs(distance) > 6
          && !event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        const clampedDistance = Math.max(-limit, Math.min(limit, distance))
        setDragOffset(clampedDistance)
      }}
      onPointerUp={finishDrag}
      onPointerCancel={() => {
        dragStart.current = null
        setDragOffset(0)
        isAnimating.current = false
      }}
    >
      {fitment && FitmentIcon && (
        <span className={`absolute left-4 top-4 z-20 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-bold ${fitment.className}`}>
          <FitmentIcon size={13} /> {fitment.label}
        </span>
      )}

      <Link
        href={detailHref}
        aria-label={`Xem ${productName}`}
        draggable={false}
        onClickCapture={(event) => {
          if (!suppressClick.current) return
          event.preventDefault()
          suppressClick.current = false
        }}
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <div
          onTransitionEnd={handleTransitionEnd}
          className={`flex h-full ${
            dragStart.current === null && isTransitioning
              ? 'transition-transform duration-300 ease-out motion-reduce:transition-none'
              : ''
          }`}
          style={{
            transform: `translate3d(calc(${-activeIndex * 100}% + ${dragOffset}px), 0, 0)`,
          }}
        >
          {displayImages.map((image, index) => (
            <figure
              key={`${image.url}-${index}`}
              className={`flex h-full w-full shrink-0 items-center justify-center p-5 sm:p-7 ${visualOptionGroup ? 'pb-20 sm:pb-24' : ''}`}
              aria-hidden={currentDisplayIndex !== (multiple ? (index === 0 ? images.length : index === displayImages.length - 1 ? 1 : index) : 1)}
            >
              <img
                src={image.url}
                alt={image.altText ?? `${productName} - ảnh ${index}`}
                width={720}
                height={720}
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.src = '/images/vf8.png'
                }}
                className="h-full w-full select-none object-contain"
              />
            </figure>
          ))}
        </div>
      </Link>

      {multiple && (
        <>
          <button
            type="button"
            aria-label={`Ảnh trước của ${productName}`}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.blur()
              previous()
            }}
            className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center border border-white/80 bg-white/80 text-brand-600 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:opacity-0 sm:group-hover/gallery:opacity-100"
          >
            <ChevronLeft size={24} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label={`Ảnh sau của ${productName}`}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.blur()
              next()
            }}
            className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center border border-white/80 bg-white/80 text-brand-600 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:opacity-0 sm:group-hover/gallery:opacity-100"
          >
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>
          <span
            aria-live="polite"
            className="absolute right-3 top-3 z-20 rounded-md bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-white backdrop-blur"
          >
            {currentDisplayIndex} / {images.length}
          </span>
        </>
      )}

      {visualOptionGroup && visualOptionGroup.values.length > 1 && (
        <VisualOptionSelector
          group={visualOptionGroup}
          product={product}
          selectedValueCode={selectedVisualValueCode}
          onSelect={onSelectVisualValue}
        />
      )}
    </div>
  )
}

export function AccessoryCard({
  product,
  selectedVehicle,
}: {
  product: CatalogProduct
  selectedVehicle?: string
}) {
  const visualOptionGroup = primaryMediaOptionGroup(product)
  const [selectedVisualValueCode, setSelectedVisualValueCode] = useState(() => (
    initialMediaOptionValue(product, visualOptionGroup)
  ))
  const visualSelection = visualOptionGroup && selectedVisualValueCode
    ? { [visualOptionGroup.code]: selectedVisualValueCode }
    : {}
  const variant = preferredVariant(product, visualSelection)
  const selectedOptions = variant
    ? { ...variant.selectedOptions, ...visualSelection }
    : visualSelection
  const images = useMemo(
    () => galleryImages(product, variant, selectedOptions),
    [product, variant, selectedVisualValueCode],
  )
  const detailParams = new URLSearchParams()
  if (variant) detailParams.set('variant', variant.sku)
  if (selectedVehicle) detailParams.set('vehicle', selectedVehicle)
  const detailQuery = detailParams.toString()
  const detailHref = `/accessories/${product.slug}${detailQuery ? `?${detailQuery}` : ''}`
  const fitmentStatus = accessoryFitmentStatus(product, selectedVehicle)
  const discounted = variant?.salePrice !== null
    && variant?.salePrice !== undefined
    && variant.salePrice < variant.originalPrice

  return (
    <article className="overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.55)] ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-28px_rgba(15,23,42,0.5)]">
      <AccessoryImageCarousel
        product={product}
        images={images}
        productName={product.name}
        detailHref={detailHref}
        selectedVehicle={selectedVehicle}
        fitmentStatus={fitmentStatus}
        visualOptionGroup={visualOptionGroup}
        selectedVisualValueCode={selectedVisualValueCode}
        onSelectVisualValue={setSelectedVisualValueCode}
      />

      <Link
        href={detailHref}
        className="block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:p-6"
      >
        <h2 className="line-clamp-2 min-h-12 text-xl font-medium leading-6 text-brand-600 transition-colors hover:text-brand-800">
          {product.name}
        </h2>
        <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-xl font-semibold tracking-tight text-slate-800">
            {priceLabel(product)}
          </p>
          {discounted && variant && product.priceRange?.minimum === product.priceRange?.maximum && (
            <p className="pb-0.5 text-sm text-slate-400 line-through">
              {formatPrice(variant.originalPrice)}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}
