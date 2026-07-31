import { NextResponse } from 'next/server'

import { ApiRouteError } from '@/lib/api/errors'
import { quoteVehiclePromotion } from '@/lib/promotions/quote'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  DepositInputError,
  parseDepositOrderInput,
  parseIdempotencyKey,
  type DepositOrderInput,
} from '@/lib/deposit/order-input'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const RESPONSE_COLUMNS =
  'id,order_number,status,deposit_amount,total_estimated_price,car_model,car_variant,created_at'

type VehicleQuote = {
  productId: string
  variantId: string | null
  depositAmount: number
  totalEstimatedPrice: number
}

type DepositOrderRow = {
  id: string
  order_number: string
  status: string
  deposit_amount: number | string
  total_estimated_price: number | string
  car_model: string
  car_variant: string
  created_at: string
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  )
}

function responseData(row: DepositOrderRow, replayed = false) {
  return {
    data: {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      depositAmount: Number(row.deposit_amount),
      totalEstimatedPrice: Number(row.total_estimated_price),
      vehicleModel: row.car_model,
      vehicleVariant: row.car_variant,
      createdAt: row.created_at,
      replayed,
    },
  }
}

function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
  return `FLD-${date}-${suffix}`
}

function compact(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

function money(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function isDepositSchemaOutdated(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  const code = String(candidate.code ?? '')
  const message = String(candidate.message ?? '')
  return code === '42703'
    || code === 'PGRST204'
    || /column deposit_orders\.[a-z_]+ does not exist/i.test(message)
}

async function vehicleQuote(input: DepositOrderInput): Promise<VehicleQuote> {
  const supabase = getSupabaseAdmin()
  const productResult = await supabase
    .from('products')
    .select('id,name,displayed_price,product_type')
    .eq('name', input.vehicleModel)
    .eq('is_active', true)
    .maybeSingle()

  if (productResult.error) throw productResult.error
  if (!productResult.data) {
    throw new DepositInputError('Mẫu xe không tồn tại hoặc đã ngừng hoạt động.')
  }

  const productType = String(productResult.data.product_type ?? '').toUpperCase()
  const typeMatches = input.vehicleType === 'motorbike'
    ? productType === 'BIKE' || productType === 'MOTORBIKE'
    : productType === 'CAR'
  if (!typeMatches) {
    throw new DepositInputError('Loại xe không khớp với mẫu xe đã chọn.')
  }

  const variantsResult = await supabase
    .from('product_variants')
    .select('id,name,original_price,sale_price,deposit_amount')
    .eq('product_id', productResult.data.id)
    .eq('is_active', true)

  if (variantsResult.error) throw variantsResult.error
  const variantKey = compact(input.vehicleVariant)
  const productKey = compact(productResult.data.name)
  const selectedVariant = (variantsResult.data ?? []).find((variant) => {
    const key = compact(variant.name)
    return key === variantKey
      || `${productKey}${key}` === variantKey
      || variantKey.endsWith(key)
  })

  if ((variantsResult.data ?? []).length > 0 && !selectedVariant) {
    throw new DepositInputError('Phiên bản xe không còn khả dụng.')
  }

  const optionResult = await supabase
    .from('product_option_values')
    .select('id,code,name,price_adjustment')
    .eq('product_id', productResult.data.id)
    .eq('is_active', true)

  const selectedNames = new Set(
    [input.exteriorColor, input.interiorColor]
      .filter((value): value is string => Boolean(value))
      .map(compact),
  )
  const selectedPackages = new Set(input.optionalPackages.map(compact))
  const optionAdjustment = optionResult.error
    ? 0
    : (optionResult.data ?? []).reduce((total, option) => {
        const isSelected = selectedNames.has(compact(option.name))
          || selectedPackages.has(compact(option.id))
          || selectedPackages.has(compact(option.code))
        return total + (isSelected ? money(option.price_adjustment) : 0)
      }, 0)

  const basePrice = money(
    selectedVariant?.sale_price
      ?? selectedVariant?.original_price
      ?? productResult.data.displayed_price,
  )
  if (basePrice <= 0) {
    throw new DepositInputError('Mẫu xe chưa có giá bán hợp lệ để đặt cọc.')
  }

  const configuredDeposit = money(selectedVariant?.deposit_amount)
  const defaultDeposit = input.vehicleType === 'motorbike' ? 2_000_000 : 10_000_000

  return {
    productId: productResult.data.id,
    variantId: selectedVariant?.id ?? null,
    depositAmount: Math.min(configuredDeposit || defaultDeposit, basePrice + optionAdjustment),
    totalEstimatedPrice: basePrice + optionAdjustment,
  }
}

async function existingOrder(idempotencyKey: string): Promise<DepositOrderRow | null> {
  const result = await getSupabaseAdmin()
    .from('deposit_orders')
    .select(RESPONSE_COLUMNS)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<DepositOrderRow>()
  if (result.error) throw result.error
  return result.data
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'VALIDATION_FAILED', 'Dữ liệu JSON không hợp lệ.')
  }

  let input: DepositOrderInput
  let idempotencyKey: string
  try {
    input = parseDepositOrderInput(body)
    idempotencyKey = parseIdempotencyKey(request.headers.get('Idempotency-Key'))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dữ liệu đặt cọc không hợp lệ.'
    return errorResponse(400, 'VALIDATION_FAILED', message)
  }

  try {
    const replay = await existingOrder(idempotencyKey)
    if (replay) return NextResponse.json(responseData(replay, true))

    const [quote, currentUser] = await Promise.all([
      vehicleQuote(input),
      getCurrentUser().catch(() => null),
    ])

    let discountAmount = 0
    if (input.promotionCode) {
      try {
        const vehicleType = input.vehicleType === 'motorbike' ? 'BIKE' : 'CAR'
        const promoQuote = await quoteVehiclePromotion(input.promotionCode, quote.totalEstimatedPrice, vehicleType)
        if (promoQuote) {
          discountAmount = promoQuote.discountAmount
        }
      } catch (e) {
        console.error('Invalid promotion code on deposit:', e)
      }
    }

    const now = new Date().toISOString()
    const insertResult = await getSupabaseAdmin()
      .from('deposit_orders')
      .insert({
        order_number: generateOrderNumber(),
        idempotency_key: idempotencyKey,
        customer_id: currentUser?.id ?? null,
        customer_type: input.customerType,
        full_name: input.fullName || input.companyName || '',
        company_name: input.companyName,
        phone_number: input.phoneNumber,
        email: input.email,
        id_card_number: input.idCardNumber,
        province: input.province,
        ward: input.ward,
        product_id: quote.productId,
        variant_id: quote.variantId,
        vehicle_type: input.vehicleType,
        car_model: input.vehicleModel,
        car_variant: input.vehicleVariant,
        exterior_color: input.exteriorColor,
        interior_color: input.interiorColor ?? '',
        optional_packages: input.optionalPackages,
        showroom: input.showroom || 'VinFast Landmark 81',
        sales_consultant: null,
        payment_method: input.paymentMethod,
        deposit_amount: quote.depositAmount,
        total_estimated_price: Math.max(0, quote.totalEstimatedPrice - discountAmount),
        promotion_code: input.promotionCode || null,
        discount_amount: discountAmount > 0 ? discountAmount : null,
        status: 'PENDING_PAYMENT',
        terms_accepted_at: now,
      })
      .select(RESPONSE_COLUMNS)
      .single<DepositOrderRow>()

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        const replay = await existingOrder(idempotencyKey)
        if (replay) return NextResponse.json(responseData(replay, true))
      }
      if (isDepositSchemaOutdated(insertResult.error)) {
        return errorResponse(
          503,
          'DEPOSIT_SCHEMA_OUTDATED',
          'Database chưa áp dụng migration 016_deposit_orders.sql.',
        )
      }
      throw insertResult.error
    }

    if (input.promotionCode && discountAmount > 0) {
      const supabase = getSupabaseAdmin()
      const { data: promo } = await supabase.from('promotions').select('id, used_count').eq('code', input.promotionCode).single()
      if (promo) {
        await supabase.from('promotions').update({ used_count: (promo.used_count || 0) + 1 }).eq('id', promo.id)
      }
    }

    return NextResponse.json(responseData(insertResult.data), { status: 201 })
  } catch (error) {
    if (error instanceof DepositInputError) {
      return errorResponse(409, 'DEPOSIT_SELECTION_INVALID', error.message)
    }
    if (isDepositSchemaOutdated(error)) {
      return errorResponse(
        503,
        'DEPOSIT_SCHEMA_OUTDATED',
        'Database chưa áp dụng migration 016_deposit_orders.sql.',
      )
    }
    console.error('Unable to create deposit order:', error)
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Không thể tạo đơn đặt cọc.')
  }
}
