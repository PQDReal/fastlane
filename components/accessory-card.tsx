'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { startNavigationLoading } from '@/components/navigation-loading-indicator'
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
    group.metadata.primary === true
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
  allowPlaceholder = true,
): CatalogResolvedMedia[] {
  const resolved = resolveCatalogMedia(product, {
    variantId: variant?.id,
    selectedOptions,
    allowPlaceholder,
  }).filter((media) => media.mediaType === 'IMAGE')
  const seen = new Set<string>()
  const images = resolved.filter((media) => {
    if (seen.has(media.url)) return false
    seen.add(media.url)
    return true
  })

  if (images.length > 0 || !allowPlaceholder) return images
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
            const selectable = candidates.length > 0
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
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(value.code)
                }}
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
  previewMode,
  visualOptionGroup,
  selectedVisualValueCode,
  onSelectVisualValue,
}: {
  product: CatalogProduct
  images: CatalogResolvedMedia[]
  productName: string
  previewMode: boolean
  visualOptionGroup: CatalogOptionGroup | null
  selectedVisualValueCode: string | null
  onSelectVisualValue: (valueCode: string) => void
}) {
  const fullSlideDuration = 300
  const minimumSettleDuration = 60
  const maximumDragRatio = 0.92
  const multiple = images.length > 1

  const [activeIndex, setActiveIndex] = useState(1)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionDuration, setTransitionDuration] = useState(fullSlideDuration)

  const dragStart = useRef<number | null>(null)
  const dragPointerId = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const fallbackTimer = useRef<number | null>(null)

  const displayImages = useMemo(() => {
    if (!multiple) return images
    return [images[images.length - 1], ...images, images[0]]
  }, [images, multiple])

  const signature = images.map((img) => img.url).join('|')

  useLayoutEffect(() => {
    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
      fallbackTimer.current = null
    }
    dragStart.current = null
    dragPointerId.current = null
    setActiveIndex(multiple ? 1 : 0)
    setDragOffset(0)
    setIsDragging(false)
    setIsTransitioning(false)
    setTransitionDuration(fullSlideDuration)
  }, [signature, multiple])

  useEffect(() => () => {
    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
    }
  }, [])

  const finalizeTransition = (targetIndex: number) => {
    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
      fallbackTimer.current = null
    }

    if (!multiple) {
      setIsTransitioning(false)
      setDragOffset(0)
      return
    }

    if (targetIndex === 0) {
      setIsTransitioning(false)
      setActiveIndex(images.length)
    } else if (targetIndex === images.length + 1) {
      setIsTransitioning(false)
      setActiveIndex(1)
    } else {
      setIsTransitioning(false)
    }
    setDragOffset(0)
  }

  const move = (direction: -1 | 1, duration = fullSlideDuration) => {
    if (!multiple || isTransitioning) return

    const nextIndex = activeIndex + direction
    setIsTransitioning(true)
    setTransitionDuration(duration)
    setDragOffset(0)
    setActiveIndex(nextIndex)

    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
    }
    fallbackTimer.current = window.setTimeout(() => {
      finalizeTransition(nextIndex)
    }, duration + 50)
  }

  const snapBack = (duration: number) => {
    setIsTransitioning(true)
    setTransitionDuration(duration)
    setDragOffset(0)

    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current)
    }
    fallbackTimer.current = window.setTimeout(() => {
      finalizeTransition(activeIndex)
    }, duration + 50)
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null || dragPointerId.current !== event.pointerId) return

    const rawDistance = event.clientX - dragStart.current
    dragStart.current = null
    dragPointerId.current = null

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore fallback
      }
    }

    setIsDragging(false)

    const width = Math.max(event.currentTarget.clientWidth, 1)
    const dragProgress = Math.min(Math.abs(rawDistance) / width, maximumDragRatio)
    suppressClick.current = Math.abs(rawDistance) > 6

    if (rawDistance <= -44) {
      const remainingDuration = Math.max(
        minimumSettleDuration,
        Math.round(fullSlideDuration * (1 - dragProgress)),
      )
      move(1, remainingDuration)
    } else if (rawDistance >= 44) {
      const remainingDuration = Math.max(
        minimumSettleDuration,
        Math.round(fullSlideDuration * (1 - dragProgress)),
      )
      move(-1, remainingDuration)
    } else {
      const returnDuration = Math.max(
        minimumSettleDuration,
        Math.round(fullSlideDuration * dragProgress),
      )
      snapBack(returnDuration)
    }

    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const activeLogicalIndex = multiple
    ? (activeIndex === 0 ? images.length - 1 : activeIndex === images.length + 1 ? 0 : activeIndex - 1)
    : 0

  return (
    <div
      role="region"
      aria-label={`Ảnh ${productName}`}
      className={`group/gallery relative aspect-square select-none overflow-hidden bg-[#f3f5f6] ${
        multiple ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ touchAction: multiple ? 'pan-y' : 'auto' }}
      onPointerDown={(event) => {
        if (
          !multiple
          || event.button !== 0
          || isTransitioning
          || dragStart.current !== null
          || (event.target as Element).closest('button')
        ) return

        dragStart.current = event.clientX
        dragPointerId.current = event.pointerId
        setIsDragging(true)
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }}
      onPointerMove={(event) => {
        if (dragStart.current === null || dragPointerId.current !== event.pointerId) return

        const limit = event.currentTarget.clientWidth * maximumDragRatio
        const distance = event.clientX - dragStart.current
        const clampedDistance = Math.max(-limit, Math.min(limit, distance))
        setDragOffset(clampedDistance)
      }}
      onPointerUp={finishDrag}
      onClickCapture={(event) => {
        if (!suppressClick.current) return
        event.preventDefault()
        event.stopPropagation()
        suppressClick.current = false
      }}
      onPointerCancel={(event) => {
        if (dragStart.current === null || dragPointerId.current !== event.pointerId) return
        dragStart.current = null
        dragPointerId.current = null
        setIsDragging(false)
        snapBack(minimumSettleDuration)
      }}
    >
      <div
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
          finalizeTransition(activeIndex)
        }}
        className="flex h-full"
        style={{
          transform: `translate3d(calc(${-activeIndex * 100}% + ${dragOffset}px), 0, 0)`,
          transition: isTransitioning
            ? `transform ${transitionDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`
            : 'none',
        }}
      >
        {images.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-5 text-sm font-medium text-slate-400">
            <ImageOff size={34} strokeWidth={1.5} aria-hidden="true" />
            <span>Chưa gắn ảnh</span>
          </div>
        ) : displayImages.map((image, index) => (
          <figure
            key={`${index}-${image.url}`}
            className={`flex h-full w-full shrink-0 items-center justify-center p-5 sm:p-7 ${
              visualOptionGroup ? 'pb-20 sm:pb-24' : ''
            }`}
            aria-hidden={multiple ? index !== activeIndex : false}
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
                if (previewMode) {
                  event.currentTarget.style.display = 'none'
                  return
                }
                event.currentTarget.src = '/images/vf8.png'
              }}
              className="h-full w-full select-none object-contain"
            />
          </figure>
        ))}
      </div>

      {multiple && (
        <>
          <button
            type="button"
            aria-label={`Ảnh trước của ${productName}`}
            disabled={isTransitioning}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.blur()
              move(-1)
            }}
            className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center border border-white/80 bg-white/80 text-brand-600 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default sm:opacity-0 sm:group-hover/gallery:opacity-100"
          >
            <ChevronLeft size={24} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            aria-label={`Ảnh sau của ${productName}`}
            disabled={isTransitioning}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.blur()
              move(1)
            }}
            className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center border border-white/80 bg-white/80 text-brand-600 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default sm:opacity-0 sm:group-hover/gallery:opacity-100"
          >
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>
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
  previewMode = false,
}: {
  product: CatalogProduct
  selectedVehicle?: string
  previewMode?: boolean
}) {
  const router = useRouter()
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
    () => galleryImages(product, variant, selectedOptions, !previewMode),
    [product, selectedVisualValueCode, previewMode, variant],
  )
  const detailParams = new URLSearchParams()
  if (variant) detailParams.set('variant', variant.sku)
  if (selectedVehicle) detailParams.set('vehicle', selectedVehicle)
  const detailQuery = detailParams.toString()
  const detailHref = `/accessories/${product.slug}${detailQuery ? `?${detailQuery}` : ''}`
  const discounted = variant?.salePrice !== null
    && variant?.salePrice !== undefined
    && variant.salePrice < variant.originalPrice
  const openDetail = () => {
    if (previewMode) return
    startNavigationLoading()
    router.push(detailHref)
  }

  return (
    <article
      role={previewMode ? undefined : 'link'}
      tabIndex={previewMode ? undefined : 0}
      aria-label={previewMode ? `Xem trước card ${product.name}` : `Xem ${product.name}`}
      onClick={(event) => {
        if (previewMode) return
        if ((event.target as Element).closest('button, input, select, textarea, a')) return
        if (event.metaKey || event.ctrlKey) {
          window.open(detailHref, '_blank')
          return
        }
        openDetail()
      }}
      onAuxClick={(event) => {
        if (previewMode) return
        if (event.button === 1) {
          if ((event.target as Element).closest('button, input, select, textarea, a')) return
          window.open(detailHref, '_blank')
        }
      }}
      onKeyDown={(event) => {
        if (previewMode) return
        if (event.target !== event.currentTarget || event.key !== 'Enter') return
        event.preventDefault()
        openDetail()
      }}
      className={`group overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.55)] ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-28px_rgba(15,23,42,0.5)] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${previewMode ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <AccessoryImageCarousel
        product={product}
        images={images}
        productName={product.name}
        previewMode={previewMode}
        visualOptionGroup={visualOptionGroup}
        selectedVisualValueCode={selectedVisualValueCode}
        onSelectVisualValue={setSelectedVisualValueCode}
      />

      <div className="p-5 sm:p-6">
        <h2 className="line-clamp-2 min-h-12 text-xl font-medium leading-6 text-brand-600 transition-colors group-hover:text-brand-700">
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
      </div>
    </article>
  )
}
