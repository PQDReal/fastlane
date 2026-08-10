import { describe, expect, it } from 'vitest'

import { localizeNotificationText } from './localization'

describe('localizeNotificationText', () => {
  it('translates order status codes in existing notification messages', () => {
    expect(localizeNotificationText('Đơn FLD-001 đã chuyển sang trạng thái PENDING_CONFIRMATION.'))
      .toBe('Đơn FLD-001 đã chuyển sang trạng thái Chờ xét duyệt tiền cọc.')
    expect(localizeNotificationText('Đơn FLD-002 đã chuyển sang trạng thái PENDING_CONTRACT.'))
      .toBe('Đơn FLD-002 đã chuyển sang trạng thái Chờ ký hợp đồng.')
  })

  it('translates every known status occurrence without changing unknown text', () => {
    expect(localizeNotificationText('PENDING_CONTRACT → CONTRACT_SIGNED → WAITING_VEHICLE'))
      .toBe('Chờ ký hợp đồng → Đã ký hợp đồng → Chờ xe')
    expect(localizeNotificationText('Mã đơn FLD-PENDING-001 vẫn giữ nguyên.'))
      .toBe('Mã đơn FLD-PENDING-001 vẫn giữ nguyên.')
  })
})
