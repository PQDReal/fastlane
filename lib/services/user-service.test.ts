import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { getSupabaseAdmin } = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))

import { syncAuth0User, type LocalUser } from '@/lib/services/user-service'

const existingUser: LocalUser = {
  id: 'user-1',
  auth0_subject: 'auth0|user-1',
  email: 'customer@example.com',
  full_name: 'Tên đã cập nhật',
  phone_number: '0901234567',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-28T00:00:00.000Z',
}

function findQuery(result: LocalUser | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result, error: null }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('syncAuth0User', () => {
  beforeEach(() => {
    getSupabaseAdmin.mockReset()
  })

  it('preserves the local profile when Auth0 claims are stale', async () => {
    const query = findQuery(existingUser)
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(query) })

    const result = await syncAuth0User({
      sub: existingUser.auth0_subject,
      email: existingUser.email,
      name: 'Tên cũ từ Auth0',
      phone_number: '0999999999',
    })

    expect(result).toEqual(existingUser)
    expect(getSupabaseAdmin).toHaveBeenCalledTimes(1)
  })

  it('updates only the email for an existing local profile', async () => {
    const find = findQuery(existingUser)
    const updatedUser = { ...existingUser, email: 'new@example.com' }
    const update = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: updatedUser, error: null }),
    }
    update.update.mockReturnValue(update)
    update.eq.mockReturnValue(update)
    update.select.mockReturnValue(update)

    getSupabaseAdmin
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(find) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(update) })

    const result = await syncAuth0User({
      sub: existingUser.auth0_subject,
      email: updatedUser.email,
      name: 'Tên cũ từ Auth0',
      phone_number: '0999999999',
    })

    expect(result).toEqual(updatedUser)
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      email: updatedUser.email,
    }))
    expect(update.update).not.toHaveBeenCalledWith(expect.objectContaining({
      full_name: expect.anything(),
      phone_number: expect.anything(),
    }))
  })

  it('reuses the existing local user for a different verified Auth0 subject', async () => {
    const noSubject = findQuery(null)
    const sameEmail = findQuery(existingUser)
    getSupabaseAdmin
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(noSubject) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(sameEmail) })

    const result = await syncAuth0User({
      sub: 'google-oauth2|user-1',
      email: 'CUSTOMER@example.com',
      email_verified: true,
    })

    expect(result).toEqual(existingUser)
    expect(getSupabaseAdmin).toHaveBeenCalledTimes(2)
  })

  it('does not reuse an account when the matching email is unverified', async () => {
    const noSubject = findQuery(null)
    const sameEmail = findQuery(existingUser)
    getSupabaseAdmin
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(noSubject) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue(sameEmail) })

    await expect(syncAuth0User({
      sub: 'auth0|unverified-user',
      email: existingUser.email,
      email_verified: false,
    })).rejects.toThrow('email must be verified')
  })})
