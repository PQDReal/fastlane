import { ApiRouteError } from '@/lib/api/errors'
import { resolveCatalogImageUrl } from '@/lib/catalog/resolver'
import type { CatalogVariantContext } from '@/lib/catalog/types'
import type { ApiCartItem } from '@/lib/cart/types'

const fullPurchaseTerms: ApiCartItem['purchaseTerms'] = {
  paymentMode: 'full',
  depositAmount: null,
  initialPaymentWindowMinutes: 30,
  balancePaymentWindowDays: null,
  gracePeriodHours: null,
  cancellationPolicy: {
    customerCancellationAllowed: true,
    customerCancellationCutoff: 'before_shipping',
    refundPercentage: 100,
    overdueRefundPercentage: 100,
    cancellationFeeAmount: '0',
  },
}

function money(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new ApiRouteError(
      422,
      'PRICE_CHANGED',
      'A catalog price is invalid.',
    )
  }
  return String(Math.round(value))
}

/** Maps a normalized variant context to the public, server-priced cart line. */
export function mapCatalogCartItem(
  context: CatalogVariantContext,
  quantity: number,
): ApiCartItem {
  const { product, variant } = context
  const listPrice = money(variant.originalPrice)
  const salePrice = variant.salePrice === null ? null : money(variant.salePrice)
  const unitPrice = Number(salePrice ?? listPrice)
  const lineTotal = unitPrice * quantity

  return {
    // cart_items is keyed by (cart_id, variant_id) and has no standalone id.
    id: variant.id,
    variantId: variant.id,
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    productKind: 'accessory',
    purchaseTerms: fullPurchaseTerms,
    sku: variant.sku,
    variantAttributes: { ...variant.selectedOptions },
    selectedOptions: variant.selectedOptionDetails.map((option) => ({
      groupId: option.groupId,
      groupCode: option.groupCode,
      groupName: option.groupName,
      valueId: option.valueId,
      valueCode: option.valueCode,
      valueName: option.valueName,
      priceAdjustment: money(option.priceAdjustment),
    })),
    quantity,
    unitListPrice: listPrice,
    unitSalePrice: salePrice,
    // Inventory-carrying variants are already priced as complete SKUs.
    unitOptionTotal: '0',
    unitPrice: String(unitPrice),
    unitAmountDueNow: String(unitPrice),
    lineTotal: String(lineTotal),
    lineAmountDueNow: String(lineTotal),
    imageUrl: resolveCatalogImageUrl(product, {
      variantId: variant.id,
      selectedOptions: variant.selectedOptions,
    }),
    availableQuantity: Math.max(0, variant.availableQuantity),
  }
}
