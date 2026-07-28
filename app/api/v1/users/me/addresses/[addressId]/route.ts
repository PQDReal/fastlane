import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse } from '@/lib/api/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/
const SELECT = 'id,label,recipient_name,address_line,ward,province,phone_number,note,is_default,created_at,updated_at'
type Context = { params: Promise<{ addressId: string }> }

type AddressRow = {
  id: string; label: string; recipient_name: string; address_line: string; ward: string | null; province: string
  phone_number: string; note: string | null; is_default: boolean; created_at: string; updated_at: string
}

function responseAddress(row: AddressRow) {
  return { id: row.id, label: row.label, recipientName: row.recipient_name, addressLine: row.address_line, ward: row.ward, province: row.province, phoneNumber: row.phone_number, note: row.note, isDefault: row.is_default, createdAt: row.created_at, updatedAt: row.updated_at }
}
function validationError(message: string) {
  return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message } }, { status: 400 })
}

export async function PATCH(request: Request, context: Context) {
  try {
    const customer = await requireCurrentCustomer()
    const { addressId } = await context.params
    if (!UUID_PATTERN.test(addressId)) return validationError('Địa chỉ không hợp lệ.')
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
    const isDefault = input.isDefault === true
    if (!label || label.length > 80) return validationError('Tên địa chỉ phải có từ 1 đến 80 ký tự.')
    if (!recipientName || recipientName.length > 120) return validationError('Tên người nhận phải có từ 1 đến 120 ký tự.')
    if (!addressLine || addressLine.length > 500) return validationError('Địa chỉ chi tiết phải có từ 1 đến 500 ký tự.')
    if (!ward || ward.length > 120) return validationError('Phường/xã không hợp lệ.')
    if (!province || province.length > 120) return validationError('Tỉnh/thành phố không hợp lệ.')
    if (!PHONE_PATTERN.test(phoneNumber)) return validationError('Số điện thoại phải có từ 9 đến 15 chữ số.')
    if (note.length > 500) return validationError('Ghi chú không được vượt quá 500 ký tự.')

    const supabase = getSupabaseAdmin()
    const existing = await supabase.from('user_addresses').select('id,is_default').eq('id', addressId).eq('user_id', customer.id).maybeSingle()
    if (existing.error) throw new Error(`Unable to read address: ${existing.error.message}`)
    if (!existing.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy địa chỉ.' } }, { status: 404 })

    if (isDefault) {
      const unset = await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', customer.id).neq('id', addressId)
      if (unset.error) throw new Error(`Unable to update default address: ${unset.error.message}`)
    }
    const { data, error } = await supabase.from('user_addresses').update({ label, recipient_name: recipientName, address_line: addressLine, ward, province, phone_number: phoneNumber, note: note || null, is_default: isDefault, updated_at: new Date().toISOString() }).eq('id', addressId).eq('user_id', customer.id).select(SELECT).single<AddressRow>()
    if (error) throw new Error(`Unable to update address: ${error.message}`)

    if (!isDefault && existing.data.is_default) {
      const replacement = await supabase.from('user_addresses').select('id').eq('user_id', customer.id).neq('id', addressId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (replacement.error) throw new Error(`Unable to choose default address: ${replacement.error.message}`)
      if (replacement.data) {
        const assign = await supabase.from('user_addresses').update({ is_default: true }).eq('id', replacement.data.id).eq('user_id', customer.id)
        if (assign.error) throw new Error(`Unable to assign default address: ${assign.error.message}`)
      } else {
        const keepDefault = await supabase.from('user_addresses').update({ is_default: true }).eq('id', addressId).eq('user_id', customer.id)
        if (keepDefault.error) throw new Error(`Unable to keep default address: ${keepDefault.error.message}`)
        data.is_default = true
      }
    }
    return NextResponse.json({ data: responseAddress(data) })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const customer = await requireCurrentCustomer()
    const { addressId } = await context.params
    if (!UUID_PATTERN.test(addressId)) return validationError('Địa chỉ không hợp lệ.')
    const supabase = getSupabaseAdmin()
    const existing = await supabase.from('user_addresses').select('id,is_default').eq('id', addressId).eq('user_id', customer.id).maybeSingle()
    if (existing.error) throw new Error(`Unable to read address: ${existing.error.message}`)
    if (!existing.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy địa chỉ.' } }, { status: 404 })
    const removed = await supabase.from('user_addresses').delete().eq('id', addressId).eq('user_id', customer.id)
    if (removed.error) throw new Error(`Unable to delete address: ${removed.error.message}`)
    if (existing.data.is_default) {
      const replacement = await supabase.from('user_addresses').select('id').eq('user_id', customer.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (replacement.error) throw new Error(`Unable to choose default address: ${replacement.error.message}`)
      if (replacement.data) {
        const assign = await supabase.from('user_addresses').update({ is_default: true }).eq('id', replacement.data.id).eq('user_id', customer.id)
        if (assign.error) throw new Error(`Unable to assign default address: ${assign.error.message}`)
      }
    }
    return new Response(null, { status: 204 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
