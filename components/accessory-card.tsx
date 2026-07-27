'use client'

import { useState } from 'react'
import { Eye, Heart, Loader2, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import type { AccessoryCatalogItem } from '@/lib/cart/types'
import {
  filterCompatibleVariants,
  resolveCatalogImageUrl,
  resolveCatalogMedia,
  resolveExactVariant,
} from '@/lib/catalog/resolver'
import type {
  CatalogOptionGroup,
  CatalogProduct,
  CatalogResolvedMedia,
  CatalogSelection,
  CatalogVariant,
} from '@/lib/catalog/types'
import { useAppStore } from '@/lib/store'
import { Button } from './ui/button'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

function primaryOptionGroup(product: CatalogProduct): CatalogOptionGroup | null {
  return product.optionGroups.find((group) => group.metadata.primary === true)
    ?? product.optionGroups.find((group) => (
      group.code === 'color'
      || group.code.endsWith('_color')
      || group.code.startsWith('color_')
    ))
    ?? product.optionGroups.find((group) => group.displayType === 'SWATCH')
    ?? product.optionGroups[0]
    ?? null
}

function valueSelection(
  group: CatalogOptionGroup | null,
  valueCode: string | null,
): CatalogSelection {
  return group && valueCode ? { [group.code]: valueCode } : {}
}

function initialValueCode(
  product: CatalogProduct,
  group: CatalogOptionGroup | null,
): string | null {
  if (!group) return null

  const withStock = group.values.find((value) => (
    filterCompatibleVariants(product.variants, { [group.code]: value.code })
      .some((variant) => variant.availableQuantity > 0)
  ))
  if (withStock) return withStock.code

  return group.values.find((value) => (
    filterCompatibleVariants(product.variants, { [group.code]: value.code })
      .length > 0
  ))?.code ?? group.values[0]?.code ?? null
}

function priceLabel(product: CatalogProduct, useFromLabel: boolean): string {
  if (!product.priceRange) return 'Liên hệ'
  if (product.priceRange.minimum === product.priceRange.maximum) {
    return formatPrice(product.priceRange.minimum)
  }
  if (useFromLabel) return `Từ ${formatPrice(product.priceRange.minimum)}`
  return `${formatPrice(product.priceRange.minimum)} – ${formatPrice(product.priceRange.maximum)}`
}

function storeItemAdapter(
  product: CatalogProduct,
  variant: CatalogVariant,
  media: CatalogResolvedMedia[],
): AccessoryCatalogItem {
  const imageUrls = media
    .filter((item) => item.mediaType === 'IMAGE')
    .map((item) => item.url)
  const image = imageUrls[0] ?? resolveCatalogImageUrl(product, {
    variantId: variant.id,
    selectedOptions: variant.selectedOptions,
  })
  const discounted = variant.salePrice !== null
    && variant.salePrice < variant.originalPrice

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
    oldPriceAmount: discounted ? variant.originalPrice : null,
    image,
    images: imageUrls.length > 0 ? imageUrls : [image],
    attributes: Object.fromEntries(
      variant.selectedOptionDetails.map((option) => [
        option.groupName,
        option.valueName,
      ]),
    ),
    availableQuantity: variant.availableQuantity,
    discount: discounted
      ? Math.round((1 - variant.effectivePrice / variant.originalPrice) * 100)
      : null,
  }
}

export function AccessoryCard({ product }: { product: CatalogProduct }) {
  const { addToCart } = useAppStore()
  const primaryGroup = primaryOptionGroup(product)
  const [selectedValueCode, setSelectedValueCode] = useState(() => (
    initialValueCode(product, primaryGroup)
  ))
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const selection = valueSelection(primaryGroup, selectedValueCode)
  const requiredGroups = product.optionGroups.filter(
    (group) => group.minimumSelections > 0,
  )
  const hasOneRequiredGroup = product.optionGroups.length === 1
    && requiredGroups.length === 1
  const directVariant = product.optionGroups.length === 0
    && product.variants.length === 1
    ? product.variants[0]
    : null
  const selectedVariant = hasOneRequiredGroup
    ? resolveExactVariant(product, selection)
    : null
  const resolvedVariant = directVariant ?? selectedVariant
  const compatibleVariants = Object.keys(selection).length > 0
    ? filterCompatibleVariants(product.variants, selection)
    : product.variants
  const availableQuantity = resolvedVariant?.availableQuantity
    ?? compatibleVariants.reduce(
      (total, variant) => total + variant.availableQuantity,
      0,
    )
  const inStock = availableQuantity > 0
  const detailHref = resolvedVariant
    ? `/accessories/${product.slug}?variant=${encodeURIComponent(resolvedVariant.sku)}`
    : `/accessories/${product.slug}`
  const resolvedMedia = resolveCatalogMedia(product, {
    variantId: resolvedVariant?.id,
    selectedOptions: selection,
  })
  const displayMedia = resolvedMedia.find((item) => item.mediaType === 'IMAGE')
    ?? resolvedMedia[0]
  const imageUrl = displayMedia?.url ?? resolveCatalogImageUrl(product, {
    variantId: resolvedVariant?.id,
    selectedOptions: selection,
  })
  const selectedValue = primaryGroup?.values.find(
    (value) => value.code === selectedValueCode,
  )
  const discounted = resolvedVariant?.salePrice !== null
    && resolvedVariant?.salePrice !== undefined
    && resolvedVariant.salePrice < resolvedVariant.originalPrice
  const discount = discounted && resolvedVariant
    ? Math.round(
      (1 - resolvedVariant.effectivePrice / resolvedVariant.originalPrice) * 100,
    )
    : null
  const displayedPrice = resolvedVariant
    ? formatPrice(resolvedVariant.effectivePrice)
    : priceLabel(product, product.optionGroups.length > 1)

  const selectValue = (valueCode: string) => {
    setSelectedValueCode(valueCode)
    setFeedback(null)
  }

  const handleAddToCart = async () => {
    if (!resolvedVariant || !inStock || submitting) return

    setSubmitting(true)
    setFeedback(null)
    const result = await addToCart(
      storeItemAdapter(product, resolvedVariant, resolvedMedia),
      1,
    )
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

  return (
    <article className="group relative flex h-full flex-col pb-4 transition-all duration-500">
      {discount !== null && (
        <div className="absolute left-4 top-4 z-20 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          -{discount}%
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
          src={imageUrl}
          alt={displayMedia?.altText || `${product.name}${selectedValue ? ` - ${selectedValue.name}` : ''}`}
          className="relative z-10 h-full w-full object-contain drop-shadow-md transition-transform duration-700 group-hover:scale-105"
        />

        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Button asChild variant="outline" className="h-10 translate-y-4 rounded-full border-none bg-white/95 px-6 text-sm font-semibold shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 hover:bg-white">
            <Link href={detailHref} aria-label={`Xem ${product.name}`}>
              <Eye size={16} className="mr-2" /> Xem
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-6">
        {primaryGroup && primaryGroup.values.length > 0 && (
          <div className="mb-4 min-h-9" aria-label={`${primaryGroup.name} của ${product.name}`}>
            {primaryGroup.displayType === 'SELECT' ? (
              <select
                value={selectedValueCode ?? ''}
                onChange={(event) => selectValue(event.target.value)}
                className="h-9 max-w-full rounded-full border border-muted bg-background px-3 text-xs font-semibold"
                aria-label={`Chọn ${primaryGroup.name}`}
              >
                {primaryGroup.values.map((value) => {
                  const matching = filterCompatibleVariants(product.variants, {
                    [primaryGroup.code]: value.code,
                  })
                  return (
                    <option key={value.id} value={value.code} disabled={matching.length === 0}>
                      {value.name}{matching.length > 0 && matching.every((variant) => variant.availableQuantity <= 0) ? ' — Hết hàng' : ''}
                    </option>
                  )
                })}
              </select>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {primaryGroup.values.map((value) => {
                  const matching = filterCompatibleVariants(product.variants, {
                    [primaryGroup.code]: value.code,
                  })
                  const selectable = matching.length > 0
                  const valueInStock = matching.some(
                    (variant) => variant.availableQuantity > 0,
                  )
                  const selected = value.code === selectedValueCode
                  const swatch = primaryGroup.displayType === 'SWATCH'

                  return (
                    <button
                      key={value.id}
                      type="button"
                      title={`${value.name}${valueInStock ? '' : ' — Hết hàng'}`}
                      aria-label={`Chọn ${value.name}${valueInStock ? '' : ', hết hàng'}`}
                      aria-pressed={selected}
                      disabled={!selectable}
                      onClick={() => selectValue(value.code)}
                      className={`relative shrink-0 transition-all disabled:cursor-not-allowed disabled:opacity-30 ${swatch ? 'h-8 w-8 rounded-md p-[3px]' : 'h-8 rounded-full px-3 text-xs font-semibold'} ${selected ? 'ring-2 ring-brand-600 ring-offset-2' : 'border border-muted hover:border-brand-400'} ${valueInStock ? '' : 'opacity-45'}`}
                    >
                      {swatch ? (
                        <span
                          className="flex h-full w-full items-center justify-center rounded-[3px] border border-black/10 bg-muted bg-cover bg-center text-[9px] font-bold"
                          style={{
                            ...(value.colorHex ? { backgroundColor: value.colorHex } : {}),
                            ...(value.swatchUrl ? { backgroundImage: `url(${value.swatchUrl})` } : {}),
                          }}
                        >
                          {!value.colorHex && !value.swatchUrl ? value.name.slice(0, 2) : null}
                        </span>
                      ) : value.name}
                      {!valueInStock && (
                        <span className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-red-500" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <h3 className="mb-2 line-clamp-2 text-lg font-bold tracking-tight text-foreground">
          <Link href={detailHref} className="transition-colors hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        {resolvedVariant ? (
          <p className="mb-3 text-xs text-muted-foreground">Mã: {resolvedVariant.sku}</p>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            {product.optionGroups.length > 1
              ? 'Chọn đầy đủ tùy chọn tại trang chi tiết'
              : 'Xem chi tiết để chọn phiên bản'}
          </p>
        )}

        <div className="mb-4 mt-auto flex items-end gap-3">
          <p className="text-xl font-bold text-brand-700">{displayedPrice}</p>
          {discounted && resolvedVariant && (
            <p className="mb-0.5 text-sm font-medium text-muted-foreground line-through">
              {formatPrice(resolvedVariant.originalPrice)}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {inStock
                ? resolvedVariant ? `Còn ${availableQuantity}` : 'Còn hàng'
                : 'Hết hàng'}
            </span>
          </div>

          {resolvedVariant && inStock ? (
            <Button
              type="button"
              variant="default"
              size="icon"
              aria-label={`Thêm ${product.name} - ${resolvedVariant.sku} vào giỏ hàng`}
              className="h-10 w-10 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
              disabled={submitting}
              onClick={handleAddToCart}
            >
              {submitting
                ? <Loader2 size={16} className="animate-spin" />
                : <ShoppingCart size={16} />}
            </Button>
          ) : (
            <Button asChild variant="default" className="h-10 rounded-full px-4">
              <Link href={detailHref}>
                <Eye size={15} className="mr-2" /> Xem
              </Link>
            </Button>
          )}
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
