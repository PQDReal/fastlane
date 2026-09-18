import 'server-only'

import { DepositInputError } from '@/lib/deposit/order-input'

const API_BASE = 'https://provinces.open-api.vn/api/v2'

type ProvincePayload = {
  code?: unknown
  name?: unknown
  wards?: Array<{ code?: unknown; name?: unknown }>
}

function normalized(value: unknown) {
  return String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('vi')
}

export class DepositLocationUnavailableError extends Error {}

export async function validateDepositLocation(input: {
  provinceCode: string
  province: string
  wardCode: string
  ward: string
}) {
  let response: Response
  try {
    response = await fetch(
      `${API_BASE}/p/${encodeURIComponent(input.provinceCode)}?depth=2`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 86_400 },
      },
    )
  } catch {
    throw new DepositLocationUnavailableError(
      'Không thể xác thực địa chỉ lúc này.',
    )
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new DepositInputError(
        'Tỉnh/Thành phố không tồn tại.',
        'province_code',
      )
    }
    throw new DepositLocationUnavailableError(
      'Không thể xác thực địa chỉ lúc này.',
    )
  }

  const payload = await response.json() as ProvincePayload
  if (
    String(payload.code) !== input.provinceCode ||
    normalized(payload.name) !== normalized(input.province)
  ) {
    throw new DepositInputError(
      'Tỉnh/Thành phố không khớp với danh sách địa chỉ.',
      'province_code',
    )
  }
  const ward = Array.isArray(payload.wards)
    ? payload.wards.find((candidate) => String(candidate.code) === input.wardCode)
    : undefined
  if (!ward || normalized(ward.name) !== normalized(input.ward)) {
    throw new DepositInputError(
      'Xã/Phường không thuộc Tỉnh/Thành phố đã chọn.',
      'ward_code',
    )
  }
}
