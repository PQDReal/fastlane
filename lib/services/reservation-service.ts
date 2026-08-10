import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendTestDriveConfirmationEmail } from '@/lib/mailer'
export type CreateTestDriveReservationInput = {
  customerId: string | null
  productId: string
  scheduledAt: string
  fullName: string
  phoneNumber: string
  email: string | null
  note: string | null
  privacyPolicyVersion: string
  marketingConsent: boolean
}

export type TestDriveReservation = {
  id: string
  referenceNumber: string
  status: string
  productId: string
  productName: string
  scheduledAt: string
  fullName: string
  phoneNumber: string
  email: string | null
}

export class ReservationConflictError extends Error {}

export async function createTestDriveReservation(
  input: CreateTestDriveReservationInput,
): Promise<TestDriveReservation> {
  const supabase = getSupabaseAdmin()
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', input.productId)
    .eq('is_active', true)
    .maybeSingle<{ id: string; name: string }>()

  if (productError) {
    throw new Error(`Unable to load test-drive product: ${productError.message}`)
  }
  if (!product) {
    throw new ReservationConflictError('Mẫu xe không còn khả dụng để lái thử')
  }

  const { data: variant, error: variantError } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', input.productId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (variantError) {
    throw new Error(`Unable to load test-drive variant: ${variantError.message}`)
  }
  if (!variant) {
    throw new ReservationConflictError('Mẫu xe chưa có phiên bản khả dụng để lái thử')
  }

  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(input.scheduledAt))

  const startOfDay = new Date(`${localDate}T00:00:00+07:00`).toISOString()
  const endOfDay = new Date(`${localDate}T23:59:59.999+07:00`).toISOString()
  const { data: duplicate, error: duplicateError } = await supabase
    .from('reservations')
    .select('id')
    .eq('phone_number', input.phoneNumber)
    .eq('product_id', input.productId)
    .in('status', ['REQUESTED', 'CONFIRMED'])
    .gte('scheduled_at', startOfDay)
    .lte('scheduled_at', endOfDay)
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (duplicateError) {
    throw new Error(`Unable to check duplicate reservation: ${duplicateError.message}`)
  }
  if (duplicate) {
    throw new ReservationConflictError(
      'Số điện thoại này đã có yêu cầu lái thử mẫu xe trong ngày đã chọn',
    )
  }

  const initialHistory = [
    {
      fromStatus: null,
      toStatus: 'REQUESTED',
      actorType: input.customerId ? 'CUSTOMER' : 'GUEST',
      reason: null,
      changedAt: new Date().toISOString(),
    },
  ]
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      customer_id: input.customerId,
      variant_id: variant.id,
      product_id: input.productId,
      type: 'TEST_DRIVE',
      status: 'REQUESTED',
      scheduled_at: input.scheduledAt,
      duration_minutes: 30,
      customer_note: input.note,
      full_name: input.fullName,
      phone_number: input.phoneNumber,
      email: input.email,
      product_name_snapshot: product.name,
      licence_acknowledged: true,
      privacy_consent: true,
      privacy_policy_version: input.privacyPolicyVersion,
      marketing_consent: input.marketingConsent,
      consent_recorded_at: new Date().toISOString(),
      status_history: initialHistory,
    })
    .select(
      'id, reference_number, status, product_id, product_name_snapshot, scheduled_at, full_name, phone_number, email',
    )
    .single()

  if (error) {
    throw new Error(`Unable to create test-drive reservation: ${error.message}`)
  }
  if (data.email) {
    sendTestDriveConfirmationEmail(data.email, {
      fullName: data.full_name,
      productName: data.product_name_snapshot,
      referenceNumber: data.reference_number,
      scheduledAt: data.scheduled_at,
    }).catch((err) => {
      console.error('Failed to send test drive confirmation email (non-blocking):', err);
    });
  }

  return {
    id: data.id,
    referenceNumber: data.reference_number,
    status: data.status,
    productId: data.product_id,
    productName: data.product_name_snapshot,
    scheduledAt: data.scheduled_at,
    fullName: data.full_name,
    phoneNumber: data.phone_number,
    email: data.email,
  }
}
