import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import type { DepositSelectionInput } from '@/lib/deposit/order-input'
import { DepositInputError } from '@/lib/deposit/order-input'
import { quoteProductPromotion } from '@/lib/promotions/quote'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type UnknownRecord = Record<string, unknown>

type OptionGroupRow = {
  id: string
  code: string
  name: string
  minimum_selections: number
  maximum_selections: number
}

type OptionValueRow = {
  id: string
  option_group_id: string
  code: string
  name: string
  price_adjustment: number | string
}

export type DepositVehicleQuote = {
  productId: string
  variantId: string | null
  depositAmount: number
  subtotal: number
  discountAmount: number
  totalEstimatedPrice: number
  promotion: {
    id: string
    code: string
    name: string
  } | null
}

function key(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

function modelKey(value: unknown) {
  return key(value)
    .replace(/^vinfast/, '')
    .replace(/theallnew2026$/, '')
}

function money(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function object(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function namedOptions(value: unknown): Array<{
  id: string
  code: string
  name: string
  price: number
}> {
  return array(value).flatMap((raw) => {
    if (typeof raw === 'string') {
      return [{ id: raw, code: raw, name: raw, price: 0 }]
    }
    const candidate = object(raw)
    const name = String(
      candidate.name ?? candidate.color_name ?? candidate.label ?? '',
    ).trim()
    if (!name) return []
    return [{
      id: String(candidate.id ?? candidate.code ?? name).trim(),
      code: String(candidate.code ?? candidate.id ?? name).trim(),
      name,
      price: money(
        candidate.price_adjustment ??
        candidate.price_delta ??
        candidate.price,
      ),
    }]
  })
}

function recursivelyNamedOptions(value: unknown, property: string) {
  const found: ReturnType<typeof namedOptions> = []
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return
    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }
    const record = candidate as UnknownRecord
    if (Array.isArray(record[property])) {
      found.push(...namedOptions(record[property]))
    }
    Object.values(record).forEach(visit)
  }
  visit(value)
  return Array.from(new Map(found.map((item) => [key(item.name), item])).values())
}

function exactOption(
  options: Array<{ id: string; code: string; name: string; price: number }>,
  selected: string,
) {
  const selectedKey = key(selected)
  return options.find((option) =>
    key(option.id) === selectedKey ||
    key(option.code) === selectedKey ||
    key(option.name) === selectedKey
  )
}

async function findProduct(input: DepositSelectionInput) {
  const supabase = getSupabaseAdmin()
  const result = await supabase
    .from('products')
    .select('id,name,slug,displayed_price,product_type,specifications')
    .eq('is_active', true)
    .in(
      'product_type',
      input.vehicleType === 'motorbike'
        ? ['BIKE', 'MOTORBIKE']
        : ['CAR'],
    )
  if (result.error) throw result.error

  const requestedExact = key(input.vehicleModel)
  const candidateNames = (product: (typeof result.data)[number]) => {
    const specifications = object(product.specifications)
    return [
      product.name,
      product.slug,
      specifications.name,
      specifications.slug,
    ]
  }
  const exactMatches = (result.data ?? []).filter((product) =>
    candidateNames(product).some((value) => key(value) === requestedExact),
  )
  const requested = modelKey(input.vehicleModel)
  const matches = exactMatches.length > 0
    ? exactMatches
    : (result.data ?? []).filter((product) =>
        candidateNames(product).some((value) => modelKey(value) === requested),
      )
  if (matches.length !== 1) {
    throw new DepositInputError(
      matches.length === 0
        ? 'Mẫu xe không tồn tại hoặc đã ngừng hoạt động.'
        : 'Mẫu xe không xác định duy nhất. Vui lòng chọn lại.',
      'car_model',
    )
  }
  return matches[0]
}

async function catalogOptions(productId: string) {
  const supabase = getSupabaseAdmin()
  const [groupsResult, valuesResult] = await Promise.all([
    supabase
      .from('product_option_groups')
      .select('id,code,name,minimum_selections,maximum_selections')
      .eq('product_id', productId)
      .eq('is_active', true)
      .returns<OptionGroupRow[]>(),
    supabase
      .from('product_option_values')
      .select('id,option_group_id,code,name,price_adjustment')
      .eq('product_id', productId)
      .eq('is_active', true)
      .returns<OptionValueRow[]>(),
  ])
  if (groupsResult.error) throw groupsResult.error
  if (valuesResult.error) throw valuesResult.error
  return {
    groups: groupsResult.data ?? [],
    values: valuesResult.data ?? [],
  }
}

export async function buildDepositVehicleQuote(
  input: DepositSelectionInput,
): Promise<DepositVehicleQuote> {
  const supabase = getSupabaseAdmin()
  const product = await findProduct(input)
  const specifications = object(product.specifications)
  const variantsResult = await supabase
    .from('product_variants')
    .select('id,name,original_price,sale_price,deposit_amount')
    .eq('product_id', product.id)
    .eq('is_active', true)
  if (variantsResult.error) throw variantsResult.error

  const requestedVariant = key(input.vehicleVariant)
  const productNames = new Set([
    key(input.vehicleModel),
    key(product.name),
    key(specifications.name),
  ].filter(Boolean))
  const selectedVariant = (variantsResult.data ?? []).find((variant) => {
    const variantName = key(variant.name)
    return requestedVariant === variantName ||
      [...productNames].some((name) => requestedVariant === `${name}${variantName}`)
  })
  if ((variantsResult.data ?? []).length > 0 && !selectedVariant) {
    throw new DepositInputError(
      'Phiên bản xe không tồn tại hoặc đã ngừng áp dụng.',
      'car_variant',
    )
  }

  const { groups, values } = await catalogOptions(product.id)
  const valuesFor = (group: OptionGroupRow) => values
    .filter((value) => value.option_group_id === group.id)
    .map((value) => ({
      id: value.id,
      code: value.code,
      name: value.name,
      price: money(value.price_adjustment),
    }))
  const exteriorGroup = groups.find((group) => group.code === 'exterior_color')
  const fallbackExterior = [
    ...namedOptions(specifications.colors),
    ...namedOptions(specifications.color_details),
  ]
  const exteriorOptions = exteriorGroup ? valuesFor(exteriorGroup) : fallbackExterior
  const selectedExterior = exactOption(exteriorOptions, input.exteriorColor)
  if (exteriorOptions.length > 0 && !selectedExterior) {
    throw new DepositInputError(
      'Màu ngoại thất không thuộc mẫu xe đã chọn.',
      'exterior_color',
    )
  }

  const interiorGroup = groups.find((group) => group.code === 'interior_color')
  const fallbackInterior = recursivelyNamedOptions(specifications, 'interiors')
  const interiorOptions = interiorGroup ? valuesFor(interiorGroup) : fallbackInterior
  const selectedInterior = input.interiorColor
    ? exactOption(interiorOptions, input.interiorColor)
    : null
  if (input.interiorColor && interiorOptions.length > 0 && !selectedInterior) {
    throw new DepositInputError(
      'Màu nội thất không tương thích với mẫu xe hoặc phiên bản đã chọn.',
      'interior_color',
    )
  }

  const packageGroups = groups.filter((group) =>
    ['package', 'optional_package', 'accessory_package'].includes(group.code)
  )
  const normalizedPackages = packageGroups.flatMap(valuesFor)
  const fallbackPackages = namedOptions(
    specifications.optional_packages ?? specifications.packages,
  )
  const packageOptions =
    normalizedPackages.length > 0 ? normalizedPackages : fallbackPackages
  const selectedPackages = input.optionalPackages.map((selected) => {
    const match = exactOption(packageOptions, selected)
    if (!match) {
      throw new DepositInputError(
        `Gói tùy chọn "${selected}" không thuộc cấu hình xe đã chọn.`,
        'optional_packages',
      )
    }
    return match
  })

  const basePrice = money(
    selectedVariant?.sale_price ??
    selectedVariant?.original_price ??
    product.displayed_price,
  )
  if (basePrice <= 0) {
    throw new DepositInputError(
      'Mẫu xe chưa có giá bán hợp lệ để đặt cọc.',
      'car_variant',
    )
  }
  const optionAdjustment =
    (selectedExterior?.price ?? 0) +
    (selectedInterior?.price ?? 0) +
    selectedPackages.reduce((total, option) => total + option.price, 0)
  const subtotal = basePrice + optionAdjustment
  const promotion = input.promotionCode
    ? await quoteProductPromotion(
        input.promotionCode,
        input.vehicleType === 'motorbike' ? 'BIKE' : 'CAR',
        subtotal,
      )
    : null
  const totalEstimatedPrice = promotion?.grandTotal ?? subtotal
  const configuredDeposit = money(selectedVariant?.deposit_amount)
  const defaultDeposit = input.vehicleType === 'motorbike' ? 2_000_000 : 10_000_000

  return {
    productId: product.id,
    variantId: selectedVariant?.id ?? null,
    depositAmount: Math.min(
      configuredDeposit || defaultDeposit,
      totalEstimatedPrice,
    ),
    subtotal,
    discountAmount: promotion?.discountAmount ?? 0,
    totalEstimatedPrice,
    promotion: promotion
      ? {
          id: promotion.promotionId,
          code: promotion.code,
          name: promotion.name,
        }
      : null,
  }
}

export function depositQuoteError(error: unknown): never {
  if (error instanceof ApiRouteError) {
    throw new DepositInputError(error.message, 'promotion_code')
  }
  throw error
}
