import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/current-user'
import {
  DepositInputError,
  parseDepositOrderInput,
  parseIdempotencyKey,
  type DepositOrderInput,
} from '@/lib/deposit/order-input'
import {
  DepositLocationUnavailableError,
  validateDepositLocation,
} from '@/lib/deposit/location'
import {
  buildDepositVehicleQuote,
  depositQuoteError,
} from '@/lib/deposit/quote'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const RESPONSE_COLUMNS =
  'id,order_number,status,deposit_amount,subtotal,discount_amount,total_estimated_price,promotion_code,car_model,car_variant,created_at,request_hash'

type DepositOrderRow = {
  id: string
  order_number: string
  status: string
  deposit_amount: number | string
  subtotal: number | string | null
  discount_amount: number | string
  total_estimated_price: number | string
  promotion_code: string | null
  car_model: string
  car_variant: string
  created_at: string
  request_hash: string | null
}

function errorResponse(status: number, code: string, message: string, field?: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId: crypto.randomUUID(),
        ...(field ? { field } : {}),
      },
    },
    { status },
  )
}

function vietnamOffsetIso(value: string) {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return value
  return new Date(instant.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+07:00')
}

function responseData(row: DepositOrderRow, replayed = false) {
  return {
    data: {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      depositAmount: Number(row.deposit_amount),
      subtotal: Number(row.subtotal ?? row.total_estimated_price),
      discountAmount: Number(row.discount_amount ?? 0),
      totalEstimatedPrice: Number(row.total_estimated_price),
      promotionCode: row.promotion_code,
      vehicleModel: row.car_model,
      vehicleVariant: row.car_variant,
      createdAt: vietnamOffsetIso(row.created_at),
      replayed,
    },
  }
}

function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
  return `FLD-${date}-${suffix}`
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

async function requestHash(input: DepositOrderInput) {
  const bytes = new TextEncoder().encode(JSON.stringify(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
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
    return errorResponse(
      400,
      'VALIDATION_FAILED',
      message,
      error instanceof DepositInputError ? error.field : undefined,
    )
  }

  try {
    const hash = await requestHash(input)
    const replay = await existingOrder(idempotencyKey)
    if (replay) {
      if (replay.request_hash && replay.request_hash !== hash) {
        return errorResponse(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Yêu cầu này đã được dùng cho một nội dung đặt cọc khác.',
        )
      }
      return NextResponse.json(responseData(replay, true))
    }

    await validateDepositLocation(input)
    let quote: Awaited<ReturnType<typeof buildDepositVehicleQuote>>
    try {
      quote = await buildDepositVehicleQuote(input)
    } catch (error) {
      depositQuoteError(error)
    }
    const currentUser = await getCurrentUser().catch(() => null)
    const now = new Date().toISOString()
    const insertResult = await getSupabaseAdmin()
      .from('deposit_orders')
      .insert({
        order_number: generateOrderNumber(),
        idempotency_key: idempotencyKey,
        request_hash: hash,
        customer_id: currentUser?.id ?? null,
        customer_type: input.customerType,
        full_name: input.fullName || input.companyName || '',
        company_name: input.companyName,
        phone_number: input.phoneNumber,
        email: input.email,
        id_card_number: input.idCardNumber,
        province: input.province,
        province_code: input.provinceCode,
        ward: input.ward,
        ward_code: input.wardCode,
        product_id: quote.productId,
        variant_id: quote.variantId,
        vehicle_type: input.vehicleType,
        car_model: input.vehicleModel,
        car_variant: input.vehicleVariant,
        exterior_color: input.exteriorColor,
        interior_color: input.interiorColor ?? '',
        optional_packages: input.optionalPackages,
        subtotal: quote.subtotal,
        discount_amount: quote.discountAmount,
        promotion_id: quote.promotion?.id ?? null,
        promotion_code: quote.promotion?.code ?? null,
        showroom: input.showroom || 'VinFast Landmark 81',
        sales_consultant: null,
        payment_method: input.paymentMethod,
        deposit_amount: quote.depositAmount,
        total_estimated_price: quote.totalEstimatedPrice,
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
          'Database chưa áp dụng migration 016 và 022 cho đơn đặt cọc.',
        )
      }
      throw insertResult.error
    }

    return NextResponse.json(responseData(insertResult.data), { status: 201 })
  } catch (error) {
    if (error instanceof DepositInputError) {
      return errorResponse(
        error.field === 'promotion_code' ? 422 : 409,
        error.field === 'promotion_code'
          ? 'PROMOTION_NOT_APPLICABLE'
          : 'DEPOSIT_SELECTION_INVALID',
        error.message,
        error.field,
      )
    }
    if (error instanceof DepositLocationUnavailableError) {
      return errorResponse(
        503,
        'LOCATION_SERVICE_UNAVAILABLE',
        error.message,
      )
    }
    if (isDepositSchemaOutdated(error)) {
      return errorResponse(
        503,
        'DEPOSIT_SCHEMA_OUTDATED',
        'Database chưa áp dụng migration 016 và 022 cho đơn đặt cọc.',
      )
    }
    console.error('Unable to create deposit order:', error)
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Không thể tạo đơn đặt cọc.')
  }
}
