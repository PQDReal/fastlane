import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const TEST_DRIVE_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
] as const

export type TestDriveStatus = (typeof TEST_DRIVE_STATUSES)[number]

export type AdminTestDriveRequest = {
  id: string
  referenceNumber: string
  fullName: string
  phoneNumber: string
  email: string | null
  productName: string
  scheduledAt: string
  confirmedAt: string | null
  status: TestDriveStatus
  note: string | null
  adminNote: string | null
  version: number
  createdAt: string
  updatedAt: string
}

type ReservationRow = {
  id: string
  reference_number: string
  full_name: string
  phone_number: string
  email: string | null
  product_name_snapshot: string
  scheduled_at: string
  confirmed_at: string | null
  status: TestDriveStatus
  customer_note: string | null
  admin_note: string | null
  status_history: unknown
  version: number
  created_at: string
  updated_at: string
}

function mapRow(row: ReservationRow): AdminTestDriveRequest {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    email: row.email,
    productName: row.product_name_snapshot,
    scheduledAt: row.scheduled_at,
    confirmedAt: row.confirmed_at,
    status: row.status,
    note: row.customer_note,
    adminNote: row.admin_note,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLUMNS =
  'id, reference_number, full_name, phone_number, email, product_name_snapshot, scheduled_at, confirmed_at, status, customer_note, admin_note, status_history, version, created_at, updated_at'

export async function listAdminTestDriveRequests(input: {
  query?: string
  status?: TestDriveStatus
}): Promise<AdminTestDriveRequest[]> {
  let query = getSupabaseAdmin()
    .from('reservations')
    .select(SELECT_COLUMNS)
    .eq('type', 'TEST_DRIVE')
    .order('scheduled_at', { ascending: false })

  if (input.status) query = query.eq('status', input.status)

  if (input.query) {
    const term = input.query.replace(/[%_,()]/g, '').trim()
    if (term) {
      query = query.or(
        `reference_number.ilike.%${term}%,full_name.ilike.%${term}%,phone_number.ilike.%${term}%,email.ilike.%${term}%`,
      )
    }
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Unable to list test-drive reservations: ${error.message}`)
  }

  return ((data ?? []) as ReservationRow[]).map(mapRow)
}

const ACTION_STATUS: Record<string, TestDriveStatus> = {
  CONFIRM: 'CONFIRMED',
  DECLINE: 'DECLINED',
  CANCEL: 'CANCELLED',
  COMPLETE: 'COMPLETED',
  MARK_NO_SHOW: 'NO_SHOW',
}

const ALLOWED_TRANSITIONS: Record<TestDriveStatus, readonly TestDriveStatus[]> = {
  REQUESTED: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
}

export class TestDriveTransitionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_ACTION',
  ) {
    super(message)
  }
}

export async function transitionTestDriveRequest(input: {
  id: string
  action: string
  expectedCurrentStatus: TestDriveStatus
  reason?: string | null
}): Promise<AdminTestDriveRequest> {
  const targetStatus = ACTION_STATUS[input.action]
  if (!targetStatus) {
    throw new TestDriveTransitionError('Thao tác trạng thái không hợp lệ', 'INVALID_ACTION')
  }

  const supabase = getSupabaseAdmin()
  const { data: current, error: loadError } = await supabase
    .from('reservations')
    .select(SELECT_COLUMNS)
    .eq('id', input.id)
    .eq('type', 'TEST_DRIVE')
    .maybeSingle<ReservationRow>()

  if (loadError) throw new Error(`Unable to load reservation: ${loadError.message}`)
  if (!current) {
    throw new TestDriveTransitionError('Không tìm thấy yêu cầu lái thử', 'NOT_FOUND')
  }
  if (current.status !== input.expectedCurrentStatus) {
    throw new TestDriveTransitionError(
      'Trạng thái đã được thay đổi. Vui lòng tải lại danh sách.',
      'CONFLICT',
    )
  }
  if (!ALLOWED_TRANSITIONS[current.status].includes(targetStatus)) {
    throw new TestDriveTransitionError(
      `Không thể chuyển từ ${current.status} sang ${targetStatus}`,
      'CONFLICT',
    )
  }

  const history = Array.isArray(current.status_history)
    ? current.status_history
    : []
  const changedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('reservations')
    .update({
      status: targetStatus,
      confirmed_at:
        targetStatus === 'CONFIRMED'
          ? current.scheduled_at
          : current.confirmed_at,
      cancellation_reason:
        targetStatus === 'CANCELLED' || targetStatus === 'DECLINED'
          ? input.reason ?? null
          : null,
      admin_note: input.reason ?? current.admin_note,
      status_history: [
        ...history,
        {
          fromStatus: current.status,
          toStatus: targetStatus,
          actorType: 'ADMIN',
          reason: input.reason ?? null,
          changedAt,
        },
      ],
      version: current.version + 1,
      updated_at: changedAt,
    })
    .eq('id', current.id)
    .eq('version', current.version)
    .select(SELECT_COLUMNS)
    .maybeSingle<ReservationRow>()

  if (error) {
    if (error.message.startsWith('INVALID_RESERVATION_TRANSITION_')) {
      throw new TestDriveTransitionError(
        'Database không cho phép chuyển trạng thái này. Vui lòng tải lại dữ liệu.',
        'CONFLICT',
      )
    }
    throw new Error(`Unable to update reservation: ${error.message}`)
  }
  if (!data) {
    throw new TestDriveTransitionError(
      'Yêu cầu vừa được cập nhật bởi người khác. Vui lòng tải lại.',
      'CONFLICT',
    )
  }

  return mapRow(data)
}
