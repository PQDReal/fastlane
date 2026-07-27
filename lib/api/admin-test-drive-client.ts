import type { AdminTestDriveRequest, TestDriveStatus } from '@/lib/services/admin-test-drive-service'

async function payload(response: Response) {
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message ?? 'Không thể xử lý yêu cầu')
  return result
}

export async function getAdminTestDriveRequests(input: { query?: string; status?: string; sort?: string }): Promise<AdminTestDriveRequest[]> {
  const search = new URLSearchParams()
  if (input.query) search.set('q', input.query)
  if (input.status) search.set('status', input.status)
  if (input.sort) search.set('sort', input.sort)
  const response = await fetch(`/api/v1/admin/test-drive/requests?${search}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  return (await payload(response)).data
}

export async function transitionAdminTestDriveRequest(input: { id: string; action: string; expectedCurrentStatus: TestDriveStatus; reason?: string }): Promise<AdminTestDriveRequest> {
  const response = await fetch(`/api/v1/admin/test-drive/requests/${input.id}/transitions`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: input.action, expectedCurrentStatus: input.expectedCurrentStatus, reason: input.reason || undefined }),
  })
  return (await payload(response)).data
}