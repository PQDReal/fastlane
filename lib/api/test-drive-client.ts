export type CreatedTestDriveReservation = {
  id: string
  referenceNumber: string
  status: string
  productId: string
  productName: string
  scheduledAt: string
}

export async function createTestDriveRequest(
  input: Record<string, unknown>,
): Promise<CreatedTestDriveReservation> {
  const response = await fetch('/api/v1/test-drive/requests', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Không thể tạo yêu cầu lái thử')
  }

  return payload.data as CreatedTestDriveReservation
}
