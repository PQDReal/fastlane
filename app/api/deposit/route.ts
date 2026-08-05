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
import { decideDepositReplay } from '@/lib/deposit/idempotency'
import {
  buildDepositVehicleQuote,
  depositQuoteError,
} from '@/lib/deposit/quote'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { VnPayConfigError } from '@/lib/payments/vnpay'
import { createOrReuseVnPayDepositPayment } from '@/lib/services/vnpay-payment-service'

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

function responseData(row: DepositOrderRow, replayed = false, paymentUrl?: string) {
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
      ...(paymentUrl ? { paymentUrl } : {}),
    },
  }
}

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
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

function isDepositPaymentSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return String(candidate.code ?? '') === 'PGRST205'
    || /vnpay_deposit_attempts/i.test(String(candidate.message ?? ''))
}

function depositPromotionError(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const message = String((error as { message?: unknown }).message ?? '')
  const messages: Record<string, string> = {
    PROMOTION_NOT_FOUND: 'Mã ưu đãi không còn tồn tại.',
    PROMOTION_INACTIVE: 'Mã ưu đãi đã ngừng áp dụng.',
    PROMOTION_NOT_STARTED: 'Mã ưu đãi chưa đến thời gian áp dụng.',
    PROMOTION_EXPIRED: 'Mã ưu đãi đã hết hạn.',
    PROMOTION_USAGE_EXHAUSTED: 'Mã ưu đãi đã hết lượt sử dụng.',
    PROMOTION_MINIMUM_NOT_MET: 'Đơn đặt cọc chưa đạt giá trị tối thiểu của mã ưu đãi.',
    PROMOTION_SNAPSHOT_MISMATCH: 'Giá trị mã ưu đãi đã thay đổi. Vui lòng áp dụng lại mã.',
    PROMOTION_SNAPSHOT_REQUIRED: 'Thông tin mã ưu đãi của đơn đặt cọc chưa đầy đủ.',
  }
  const code = Object.keys(messages).find((candidate) => message.includes(candidate))
  return code ? { code, message: messages[code] } : null
}

async function requestHash(input: DepositOrderInput) {
  const bytes = new TextEncoder().encode(JSON.stringify(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function existingOrder(
  idempotencyKey: string,
  customerId: string | null,
  guestEmail: string,
): Promise<DepositOrderRow | null> {
  let query = getSupabaseAdmin()
    .from('deposit_orders')
    .select(RESPONSE_COLUMNS)
    .eq('idempotency_key', idempotencyKey)

  query = customerId
    ? query.eq('customer_id', customerId)
    : query.is('customer_id', null).ilike('email', guestEmail)

  const result = await query.maybeSingle<DepositOrderRow>()
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
    const currentUser = await getCurrentUser().catch(() => null)
    if (currentUser?.role === 'ADMIN') {
      return errorResponse(403, 'ADMIN_DEPOSIT_FORBIDDEN', 'Tài khoản quản trị không được tạo đơn đặt cọc xe.')
    }
    const customerId = currentUser?.id ?? null
    const guestEmail = input.email
    const replay = await existingOrder(idempotencyKey, customerId, guestEmail)
    if (replay) {
      if (decideDepositReplay(replay.request_hash, hash) === 'CONFLICT') {
        return errorResponse(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Yêu cầu này đã được dùng cho một nội dung đặt cọc khác.',
        )
      }
      const paymentUrl = await createOrReuseVnPayDepositPayment(
        { id: replay.id, orderNumber: replay.order_number },
        clientIp(request),
      )
      return NextResponse.json(responseData(replay, true, paymentUrl))
    }

    await validateDepositLocation(input)
    let quote: Awaited<ReturnType<typeof buildDepositVehicleQuote>>
    try {
      quote = await buildDepositVehicleQuote(input)
    } catch (error) {
      depositQuoteError(error)
    }
    if (
      !Number.isFinite(quote.totalEstimatedPrice) || quote.totalEstimatedPrice <= 0 ||
      !Number.isFinite(quote.depositAmount) || quote.depositAmount <= 0
    ) {
      return errorResponse(
        422,
        'INVALID_PAYMENT_AMOUNT',
        'Mẫu xe hoặc ưu đãi đang chọn không có số tiền thanh toán hợp lệ.',
        'car_variant',
      )
    }
    const now = new Date().toISOString()

    // Resolve matching vehicle_variant_id from vehicle_variants table for DB relation
    let vehicleVariantId: string | null = input.vehicleType === 'motorbike'
      ? quote.variantId
      : null
    try {
      if (input.vehicleType === 'car') {
        const { data: vVariants } = await getSupabaseAdmin()
          .from('vehicle_variants')
          .select('id, product_name, variant_name, version, color')
      
        const model = input.vehicleModel
        const color = input.exteriorColor
        const variant = input.vehicleVariant

        const matchingVv = (vVariants || []).find((vv: any) => {
          const pNameMatch = vv.product_name?.toLowerCase().includes(model.toLowerCase()) || model.toLowerCase().includes(vv.product_name?.toLowerCase() || '')
        
          const colorMatch = color && vv.color ? vv.color.toLowerCase() === color.toLowerCase() : (!color && !vv.color)
          const versionMatch = variant && vv.version ? variant.toLowerCase().includes(vv.version.toLowerCase()) : (!variant && !vv.version)
        
          return pNameMatch && colorMatch && versionMatch
        }) || (vVariants || []).find((vv: any) => {
          // Fallback: match version at least
          const pNameMatch = vv.product_name?.toLowerCase().includes(model.toLowerCase()) || model.toLowerCase().includes(vv.product_name?.toLowerCase() || '')
          const versionMatch = variant && vv.version ? variant.toLowerCase().includes(vv.version.toLowerCase()) : (!variant && !vv.version)
          return pNameMatch && versionMatch
        })

        if (matchingVv) {
          vehicleVariantId = matchingVv.id
        }
      }
    } catch {
      vehicleVariantId = input.vehicleType === 'motorbike' ? quote.variantId : null
    }

    const insertResult = await getSupabaseAdmin()
      .from('deposit_orders')
      .insert({
        order_number: generateOrderNumber(),
        idempotency_key: idempotencyKey,
        request_hash: hash,
        customer_id: customerId,
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
        // Vehicle orders only use vehicle_variant_id. The deprecated variant_id
        // column is intentionally omitted so its historical values stay read-only.
        vehicle_variant_id: vehicleVariantId,
        vehicle_type: input.vehicleType,
        car_model: input.vehicleModel,
        car_variant: input.vehicleVariant,
        exterior_color: input.exteriorColor,
        interior_color: input.interiorColor ?? '',
        optional_packages: input.optionalPackages,
        subtotal: quote.subtotal,
        discount_amount: quote.discountAmount,
        total_estimated_price: quote.totalEstimatedPrice,
        promotion_id: quote.promotion?.id ?? null,
        promotion_code: quote.promotion?.code ?? null,
        showroom: input.showroom || 'VinFast Landmark 81',
        sales_consultant: null,
        payment_method: input.paymentMethod,
        deposit_amount: quote.depositAmount,
        status: 'PENDING_DEPOSIT',
        terms_accepted_at: now,
      })
      .select(RESPONSE_COLUMNS)
      .single<DepositOrderRow>()

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        const replay = await existingOrder(
          idempotencyKey,
          customerId,
          guestEmail,
        )
        if (replay) {
          if (decideDepositReplay(replay.request_hash, hash) === 'CONFLICT') {
            return errorResponse(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Yêu cầu này đã được dùng cho một nội dung đặt cọc khác.',
            )
          }
          const paymentUrl = await createOrReuseVnPayDepositPayment(
            { id: replay.id, orderNumber: replay.order_number },
            clientIp(request),
          )
          return NextResponse.json(responseData(replay, true, paymentUrl))
        }
      }
      if (insertResult.error.code === '23514') {
        return errorResponse(
          400,
          'DEPOSIT_CONSTRAINT_VIOLATION',
          'Số điện thoại hoặc thông tin đặt cọc không đúng định dạng.',
        )
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

    const paymentUrl = await createOrReuseVnPayDepositPayment(
      { id: insertResult.data.id, orderNumber: insertResult.data.order_number },
      clientIp(request),
    )
    return NextResponse.json(responseData(insertResult.data, false, paymentUrl), { status: 201 })
  } catch (error) {
    const promotionError = depositPromotionError(error)
    if (promotionError) {
      return errorResponse(
        422,
        promotionError.code,
        promotionError.message,
        'promotion_code',
      )
    }
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
    if (error instanceof VnPayConfigError) {
      return errorResponse(503, 'VNPAY_NOT_CONFIGURED', error.message)
    }
    if (isDepositPaymentSchemaMissing(error)) {
      return errorResponse(
        503,
        'PAYMENT_SCHEMA_NOT_READY',
        'Database chưa áp dụng migration 033 cho thanh toán đặt cọc VNPAY.',
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
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Không thể tạo đơn đặt cọc. ' + (error instanceof Error ? error.message : JSON.stringify(error)))
  }
}
