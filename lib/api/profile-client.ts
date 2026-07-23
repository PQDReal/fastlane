export type CustomerProfile = {
  id: string
  email: string
  role: string
  fullName: string
  phoneNumber: string | null
  createdAt: string
  updatedAt: string
}

type ProfileResponse = { data: CustomerProfile }

async function parseResponse(response: Response): Promise<ProfileResponse> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Không thể xử lý hồ sơ')
  return payload as ProfileResponse
}

export async function getMyProfile(): Promise<CustomerProfile> {
  const response = await fetch('/api/v1/users/me', {
    headers: { Accept: 'application/json' },
  })
  return (await parseResponse(response)).data
}

export async function updateMyProfile(input: {
  fullName: string
  phoneNumber: string | null
}): Promise<CustomerProfile> {
  const response = await fetch('/api/v1/users/me', {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await parseResponse(response)).data
}