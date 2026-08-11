import type { AdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft'
import type { AdminAccessoryDraftRecord } from '@/lib/catalog/admin-accessory-draft-server'

type ApiResponse<T> = { data: T }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
  if (!response.ok) throw new Error(body?.error?.message || 'Không thể đồng bộ bản nháp.')
  return (body as ApiResponse<T>).data
}

export function listAdminAccessoryDrafts() {
  return request<AdminAccessoryDraftRecord[]>('/api/v1/admin/accessory-drafts')
}

export function saveAdminAccessoryDraft(input: { draftId?: string; clientKey: string; draft: AdminAccessoryDraft; productId?: string | null; expectedRevision?: number }) {
  return request<AdminAccessoryDraftRecord>('/api/v1/admin/accessory-drafts', { method: 'POST', body: JSON.stringify(input) })
}

export function archiveAdminAccessoryDraft(draftId: string, expectedRevision?: number) {
  const query = expectedRevision == null ? '' : `?revision=${encodeURIComponent(expectedRevision)}`
  return request<AdminAccessoryDraftRecord>(`/api/v1/admin/accessory-drafts/${draftId}${query}`, { method: 'DELETE' })
}
