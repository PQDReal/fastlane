import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { Auth0ManagementError, createAuth0User, deleteAuth0User } from '@/lib/auth0-management'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/

async function authorize(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
    return null
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    throw error
  }
}

export async function GET(request: Request) {
  const authError = await authorize(request)
  if (authError) return authError

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('id,email,full_name,phone_number,role,status,email_verified,created_at,updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Không thể tải danh sách khách hàng.' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const authError = await authorize(request)
  if (authError) return authError

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : ''
  const phoneNumber = input.phoneNumber === null || input.phoneNumber === ''
    ? null
    : typeof input.phoneNumber === 'string' ? input.phoneNumber.trim() : ''

  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự.' }, { status: 400 })
  if (!fullName || fullName.length > 255) return NextResponse.json({ error: 'Họ và tên không hợp lệ.' }, { status: 400 })
  if (phoneNumber !== null && !PHONE_PATTERN.test(phoneNumber)) return NextResponse.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 })

  let auth0User
  try {
    auth0User = await createAuth0User({ email, password, fullName, phoneNumber })
  } catch (error) {
    const message = error instanceof Auth0ManagementError ? error.message : 'Không thể tạo tài khoản trên Auth0.'
    const status = error instanceof Auth0ManagementError ? error.status : 502
    return NextResponse.json({ error: message }, { status })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .insert({
      auth0_subject: auth0User.user_id,
      email,
      full_name: fullName,
      phone_number: phoneNumber,
      email_verified: false,
      role: 'CUSTOMER',
      status: 'ACTIVE',
    })
    .select('id,email,full_name,phone_number,role,status,email_verified,created_at,updated_at')
    .single()

  if (error) {
    await deleteAuth0User(auth0User.user_id).catch(() => undefined)
    const conflict = error.code === '23505'
    return NextResponse.json({ error: conflict ? 'Email đã tồn tại.' : 'Không thể lưu tài khoản vào database.' }, { status: conflict ? 409 : 500 })
  }

  return NextResponse.json({ ...data, email_verified: false }, { status: 201 })
}