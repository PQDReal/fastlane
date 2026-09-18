import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse } from '@/lib/api/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const PHONE_PATTERN = /^\+?[0-9]{9,15}$/
const SELECT = 'id,label,recipient_name,address_line,ward,province,phone_number,note,is_default,created_at,updated_at'

type AddressRow = {
  id: string
  label: string
  recipient_name: string
  address_line: string
  ward: string | null
  province: string
  phone_number: string
  note: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

function responseAddress(row: AddressRow) {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    addressLine: row.address_line,
    ward: row.ward,
    province: row.province,
    phoneNumber: row.phone_number,
    note: row.note,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function validationError(message: string) {
  return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message } }, { status: 400 })
}

export async function GET() {
  try {
    const customer = await requireCurrentCustomer()
    const { data, error } = await getSupabaseAdmin()
      .from('user_addresses')
      .select(SELECT)
      .eq('user_id', customer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw new Error(`Unable to load saved addresses: ${error.message}`)
    return NextResponse.json({ data: ((data ?? []) as AddressRow[]).map(responseAddress) })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return validationError('Dữ liệu địa chỉ không hợp lệ.')

    const input = body as Record<string, unknown>
    const label = typeof input.label === 'string' ? input.label.trim() : ''
    const recipientName = typeof input.recipientName === 'string' ? input.recipientName.trim() : ''
    const addressLine = typeof input.addressLine === 'string' ? input.addressLine.trim() : ''
    const ward = typeof input.ward === 'string' ? input.ward.trim() : ''
    const province = typeof input.province === 'string' ? input.province.trim() : ''
    const phoneNumber = typeof input.phoneNumber === 'string' ? input.phoneNumber.replace(/[\s.-]/g, '') : ''
    const note = typeof input.note === 'string' ? input.note.trim() : ''
    const requestedDefault = input.isDefault === true

    if (!label || label.length > 80) return validationError('Tên địa chỉ phải có từ 1 đến 80 ký tự.')
    if (!recipientName || recipientName.length > 120) return validationError('Tên người nhận phải có từ 1 đến 120 ký tự.')
    if (!addressLine || addressLine.length > 500) return validationError('Địa chỉ chi tiết phải có từ 1 đến 500 ký tự.')
    if (ward.length > 120) return validationError('Phường/xã không được vượt quá 120 ký tự.')
    if (!province || province.length > 120) return validationError('Tỉnh/thành phố không hợp lệ.')
    if (!PHONE_PATTERN.test(phoneNumber)) return validationError('Số điện thoại phải có từ 9 đến 15 chữ số.')
    if (note.length > 500) return validationError('Ghi chú không được vượt quá 500 ký tự.')

    const { count, error: countError } = await getSupabaseAdmin()
      .from('user_addresses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', customer.id)
    if (countError) throw new Error(`Unable to count saved addresses: ${countError.message}`)
    if ((count ?? 0) >= 10) return validationError('Bạn đã lưu tối đa 10 địa chỉ. Vui lòng sửa hoặc xóa địa chỉ cũ trước khi thêm mới.')

    const isDefault = (count ?? 0) === 0 || requestedDefault
    if (isDefault && (count ?? 0) > 0) {
      const unset = await getSupabaseAdmin().from('user_addresses').update({ is_default: false }).eq('user_id', customer.id)
      if (unset.error) throw new Error(`Unable to update default address: ${unset.error.message}`)
    }

    const { data, error } = await getSupabaseAdmin()
      .from('user_addresses')
      .insert({
        user_id: customer.id,
        label,
        recipient_name: recipientName,
        address_line: addressLine,
        ward: ward || null,
        province,
        phone_number: phoneNumber,
        note: note || null,
        is_default: isDefault,
      })
      .select(SELECT)
      .single<AddressRow>()

    if (error) throw new Error(`Unable to save address: ${error.message}`)
    return NextResponse.json({ data: responseAddress(data) }, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
