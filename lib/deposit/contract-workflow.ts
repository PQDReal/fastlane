export type DepositContractMode = 'CAR_SALES' | 'BIKE_PURCHASE_TERMS' | 'BIKE_BATTERY_RENTAL'

type ContractOrderLike = {
  vehicle_type?: string | null
  car_variant?: string | null
  vehicle_variants?: { variant_name?: string | null; version?: string | null } | Array<{ variant_name?: string | null; version?: string | null }> | null
}

/** Derives the document shown at stage 3 from persisted, schema-backed order data. */
export function getDepositContractMode(order: ContractOrderLike): DepositContractMode {
  if (order.vehicle_type !== 'motorbike') return 'CAR_SALES'
  const variant = Array.isArray(order.vehicle_variants) ? order.vehicle_variants[0] : order.vehicle_variants
  const label = [order.car_variant, variant?.variant_name, variant?.version]
    .filter(Boolean).join(' ').toLowerCase()
  return /thuê\s*pin|không\s*kèm\s*pin|rental/.test(label)
    ? 'BIKE_BATTERY_RENTAL'
    : 'BIKE_PURCHASE_TERMS'
}

export function contractStageCopy(mode: DepositContractMode) {
  if (mode === 'BIKE_BATTERY_RENTAL') return {
    status: 'Thỏa thuận thuê pin: Hợp đồng thuê pin đã sẵn sàng. Vui lòng xem và xác nhận.',
    action: 'Xem & Xác nhận HĐ thuê pin',
    title: 'THỎA THUẬN THUÊ PIN XE MÁY ĐIỆN VINFAST',
    consent: 'Tôi đã đọc, hiểu rõ và đồng ý với toàn bộ điều khoản của Thỏa thuận thuê pin xe máy điện VinFast.',
  }
  if (mode === 'BIKE_PURCHASE_TERMS') return {
    status: 'Xác nhận thỏa thuận đặt mua: Thông tin đơn hàng đã sẵn sàng. Vui lòng xem và xác nhận.',
    action: 'Xem & Xác nhận đặt mua',
    title: 'THỎA THUẬN ĐẶT MUA XE MÁY ĐIỆN VINFAST',
    consent: 'Tôi đã đọc, hiểu rõ và đồng ý với các điều khoản của Thỏa thuận đặt mua xe máy điện VinFast.',
  }
  return {
    status: 'Ký hợp đồng: Hợp đồng mua xe điện tử đã sẵn sàng. Vui lòng xem & ký hợp đồng.',
    action: 'Xem & Ký HĐ',
    title: 'HỢP ĐỒNG MUA BÁN XE Ô TÔ ĐIỆN VINFAST',
    consent: 'Tôi đã đọc, hiểu rõ và đồng ý với toàn bộ các điều khoản của Hợp đồng mua bán xe ô tô điện VinFast.',
  }
}
