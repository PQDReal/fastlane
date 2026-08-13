import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }))

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { navigationActionMarkdown, requestsNavigation, resolveSalesAgentNavigation, stripUntrustedNavigation } from './resolver'

describe('sales agent navigation resolver', () => {
  it('only detects explicit navigation language', () => {
    expect(requestsNavigation('Giá VF 8 hiện tại là bao nhiêu?')).toBe(false)
    expect(requestsNavigation('Gửi tôi đường dẫn xem sản phẩm VF 8')).toBe(true)
  })

  it('removes model-authored URLs and only renders a server-owned action', () => {
    expect(stripUntrustedNavigation('Xem [VF 8](/cars/fabricated) hoặc https://example.com')).toBe('Xem VF 8 hoặc')
    expect(navigationActionMarkdown({ actionKey: 'VIEW_PRODUCT', entityType: 'CAR', entityId: 'p1', label: 'Xem [VF 8]', href: '/cars/vf-8' })).toBe('[Xem \\[VF 8\\]](/cars/vf-8)')
  })

  it('resolves an allowlisted product href from server data', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({ data: { id: 'p1', name: 'VF 8', slug: 'vf-8', product_type: 'CAR' }, error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    await expect(resolveSalesAgentNavigation({ actionKey: 'VIEW_PRODUCT', entityType: 'CAR', entityId: 'p1' })).resolves.toMatchObject({ href: '/cars/vf-8' })
  })

  it('does not resolve a mismatched entity type', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({ data: { id: 'p1', name: 'VF 8', slug: 'vf-8', product_type: 'CAR' }, error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    await expect(resolveSalesAgentNavigation({ actionKey: 'VIEW_PRODUCT', entityType: 'ACCESSORY', entityId: 'p1' })).resolves.toBeNull()
  })
})
