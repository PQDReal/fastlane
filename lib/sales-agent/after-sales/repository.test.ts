import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockState = vi.hoisted(() => ({
  release: {
    release_id: 'release-approved-1',
    published_at: '2026-08-20T09:47:14.577Z',
  },
  facts: [] as Array<Record<string, unknown>>,
  locations: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let rows: Array<Record<string, unknown>> = table === 'after_sales_published_facts'
        ? [...mockState.facts]
        : table === 'after_sales_published_service_locations'
          ? [...mockState.locations]
          : [mockState.release]
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => {
          rows = rows.filter((row) => row[field] === value)
          return builder
        }),
        in: vi.fn((field: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[field]))
          return builder
        }),
        maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return builder
    },
  }),
}))

import {
  findServiceLocationsRepository,
  searchAfterSalesRepository,
} from './repository'

function fact(overrides: Record<string, unknown>) {
  const factId = String(overrides.fact_id)
  return {
    fact_id: factId,
    fact_group_id: `group-${factId}`,
    release_id: mockState.release.release_id,
    service_type: 'maintenance',
    vehicle_type: 'car',
    powertrain: 'electric',
    model: null,
    subject: 'vehicle',
    policy_entity: 'vehicle',
    battery_chemistry: 'not_applicable',
    usage_condition: 'general',
    applicability: 'general',
    action: 'scheduled_service',
    fact_type: 'maintenance_interval_distance',
    value_numeric: 12000,
    value_text: '12.000 km',
    unit: 'km',
    qualifier: 'whichever_comes_first',
    interval_relation: 'or',
    interval_group_id: `interval-${factId}`,
    interval_group_distance_policy: 'limited',
    distance_policy: 'limited',
    updated_at: mockState.release.published_at,
    evidence: [{
      source_url: 'https://vinfastauto.com/vn_vi/dich-vu-bao-duong-oto',
      excerpt: `Evidence ${factId}`,
      captured_at: mockState.release.published_at,
    }],
    ...overrides,
  }
}

function location(overrides: Record<string, unknown>) {
  const locationId = String(overrides.location_id)
  return {
    location_id: locationId,
    release_id: mockState.release.release_id,
    name: `Xưởng ${locationId}`,
    location_category: 'electric_motorbike_workshop',
    category_label: 'Xưởng dịch vụ Xe máy điện',
    vehicle_types: ['motorbike'],
    service_types: ['general_after_sales'],
    bookable_service_types: [],
    capability_granularity: 'location_category_only',
    address: {
      province: 'Hồ Chí Minh',
      district: 'Quận 1',
      fullAddress: '1 Nguyễn Huệ, Thành phố Hồ Chí Minh',
      latitude: 10.77,
      longitude: 106.7,
      directionsUrl: 'https://www.google.com/maps/search/?api=1&query=10.77,106.7',
    },
    contact: { servicePhone: '1900232389' },
    service_hours: { opensAt: '08h00', closesAt: '21h00', applicableDays: null },
    operational_status: 'active',
    evidence: { sourceUrl: 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac' },
    updated_at: mockState.release.published_at,
    ...overrides,
  }
}

describe('published after-sales repositories', () => {
  beforeEach(() => {
    mockState.facts = [
      fact({ fact_id: 'car-maintenance-distance', interval_group_id: 'car-maintenance' }),
      fact({
        fact_id: 'car-maintenance-time',
        interval_group_id: 'car-maintenance',
        fact_type: 'maintenance_interval_time',
        value_numeric: 12,
        value_text: 'hàng năm',
        unit: 'month',
      }),
      fact({
        fact_id: 'petrol-maintenance',
        powertrain: 'petrol',
        interval_group_id: 'petrol-maintenance',
        value_numeric: 8000,
        value_text: '8.000 km',
      }),
      fact({
        fact_id: 'brake-fluid-distance',
        vehicle_type: 'motorbike',
        powertrain: 'electric',
        subject: 'brake_fluid',
        policy_entity: 'brake_fluid',
        action: 'inspect',
        interval_group_id: 'brake-fluid',
        value_numeric: 1000,
        value_text: '1.000 km',
      }),
      fact({
        fact_id: 'brake-fluid-time',
        vehicle_type: 'motorbike',
        powertrain: 'electric',
        subject: 'brake_fluid',
        policy_entity: 'brake_fluid',
        action: 'inspect',
        fact_type: 'maintenance_interval_time',
        interval_group_id: 'brake-fluid',
        value_numeric: 6,
        value_text: '6 tháng',
        unit: 'month',
      }),
      fact({
        fact_id: 'brake-system-distance',
        vehicle_type: 'motorbike',
        powertrain: 'electric',
        subject: 'brake_system',
        policy_entity: 'brake_system',
        action: 'lubricate',
        interval_group_id: 'brake-system',
        value_numeric: 5000,
        value_text: '5.000 km',
      }),
      fact({
        fact_id: 'brake-system-time',
        vehicle_type: 'motorbike',
        powertrain: 'electric',
        subject: 'brake_system',
        policy_entity: 'brake_system',
        action: 'lubricate',
        fact_type: 'maintenance_interval_time',
        interval_group_id: 'brake-system',
        value_numeric: 6,
        value_text: '6 tháng',
        unit: 'month',
      }),
      fact({
        fact_id: 'vf8-vehicle-duration',
        service_type: 'warranty',
        model: 'VF 8',
        subject: 'vehicle',
        policy_entity: 'vehicle',
        usage_condition: 'standard_use',
        applicability: 'original_vehicle',
        action: 'warranty_coverage',
        fact_type: 'vehicle_warranty_duration',
        interval_group_id: 'vf8-vehicle',
        value_numeric: 10,
        value_text: '10 năm',
        unit: 'year',
      }),
      fact({
        fact_id: 'vf8-vehicle-distance',
        service_type: 'warranty',
        model: 'VF 8',
        subject: 'vehicle',
        policy_entity: 'vehicle',
        usage_condition: 'standard_use',
        applicability: 'original_vehicle',
        action: 'warranty_coverage',
        fact_type: 'vehicle_warranty_distance',
        interval_group_id: 'vf8-vehicle',
        value_numeric: 200000,
        value_text: '200.000 km',
      }),
      fact({
        fact_id: 'vf8-battery-duration',
        service_type: 'warranty',
        model: 'VF 8',
        subject: 'battery',
        policy_entity: 'battery',
        usage_condition: 'standard_use',
        applicability: 'original_equipment',
        action: 'warranty_coverage',
        fact_type: 'battery_warranty_duration',
        interval_group_id: 'vf8-battery',
        value_numeric: 10,
        value_text: '10 năm',
        unit: 'year',
      }),
      fact({
        fact_id: 'vf8-battery-distance',
        service_type: 'warranty',
        model: 'VF 8',
        subject: 'battery',
        policy_entity: 'battery',
        usage_condition: 'standard_use',
        applicability: 'original_equipment',
        action: 'warranty_coverage',
        fact_type: 'battery_warranty_distance',
        interval_group_id: 'vf8-battery',
        value_numeric: 200000,
        value_text: '200.000 km',
      }),
      fact({
        fact_id: 'repair-window',
        service_type: 'repair',
        subject: 'repair_service',
        policy_entity: 'repair_service',
        action: 'appointment_arrival',
        fact_type: 'appointment_arrival_window',
        interval_group_id: null,
        value_numeric: 30,
        value_text: '30 phút',
        unit: 'minute',
      }),
      fact({
        fact_id: 'rescue-dispatch',
        service_type: 'rescue',
        subject: 'emergency_response',
        policy_entity: 'emergency_response',
        action: 'request_dispatch',
        fact_type: 'service_response_time',
        interval_group_id: null,
        value_numeric: 10,
        value_text: '10 phút',
        unit: 'minute',
      }),
      fact({
        fact_id: 'rescue-callback',
        service_type: 'rescue',
        subject: 'emergency_response',
        policy_entity: 'emergency_response',
        action: 'customer_callback',
        fact_type: 'service_response_time',
        interval_group_id: null,
        value_numeric: 15,
        value_text: '15 phút',
        unit: 'minute',
      }),
    ]
    mockState.locations = [
      location({ location_id: 'hcm-1' }),
      location({
        location_id: 'hcm-2',
        name: 'VinFast Phan Văn Trị',
        address: {
          province: 'Hồ Chí Minh',
          district: 'Phường Gò Vấp',
          fullAddress: 'Phan Văn Trị, Thành phố Hồ Chí Minh',
        },
      }),
      location({
        location_id: 'hcm-3',
        name: 'VinFast Caron Tân Tạo',
        address: {
          province: 'Hồ Chí Minh',
          district: 'Phường Tân Tạo',
          fullAddress: 'Hồ Văn Long, Thành phố Hồ Chí Minh',
        },
      }),
      location({
        location_id: 'hanoi-1',
        address: { province: 'Hà Nội', district: 'Cầu Giấy', fullAddress: 'Cầu Giấy, Hà Nội' },
      }),
      location({
        location_id: 'inactive',
        operational_status: 'inactive',
      }),
    ]
  })

  it('returns paired vehicle and battery warranty groups for the exact car model', async () => {
    const result = await searchAfterSalesRepository({
      serviceType: 'warranty',
      vehicleType: 'car',
      model: 'VinFast VF 8 2024',
      query: 'VF 8 được bảo hành xe và pin bao lâu?',
      topK: 4,
    }, 'call-warranty')

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return
    expect(result.data.groups.map((group: any) => group.subject)).toEqual(expect.arrayContaining(['vehicle', 'battery']))
    expect(result.data.groups.find((group: any) => group.subject === 'vehicle').summary).toContain('10 năm hoặc 200.000 km')
    expect(result.data.groups.find((group: any) => group.subject === 'battery').summary).toContain('10 năm hoặc 200.000 km')
    expect(result.data.route).toBe('/after-sales?vehicle=car&tab=warranty#warranty-term')
    expect(result.evidence.every((item) => item.entity.kind === 'AFTER_SALES_FACT')).toBe(true)
  })

  it('uses the generic electric schedule for a future-compatible VF model query', async () => {
    const result = await searchAfterSalesRepository({
      serviceType: 'maintenance',
      vehicleType: 'car',
      model: 'VF 8 2024',
      query: 'VF 8 cần bảo dưỡng định kỳ sau bao lâu hoặc bao nhiêu km?',
      topK: 2,
    }, 'call-maintenance')

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return
    expect(result.data.groups).toHaveLength(1)
    expect(result.data.groups[0].summary).toContain('12.000 km hoặc hàng năm')
    expect(result.data.groups.some((group: any) => group.summary.includes('8.000 km'))).toBe(false)
    expect(result.data.groups.some((group: any) => group.subject === 'engine_oil')).toBe(false)
  })

  it('keeps brake-fluid inspection and brake-system lubrication as separate contexts', async () => {
    const result = await searchAfterSalesRepository({
      serviceType: 'maintenance',
      vehicleType: 'motorbike',
      query: 'Xe máy điện cần bảo dưỡng phanh sau bao lâu hoặc bao nhiêu km?',
      topK: 4,
    }, 'call-brakes')

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return
    expect(result.data.groups.find((group: any) => group.subject === 'brake_fluid').summary)
      .toContain('1.000 km hoặc 6 tháng')
    expect(result.data.groups.find((group: any) => group.subject === 'brake_system').summary)
      .toContain('5.000 km hoặc 6 tháng')
  })

  it.each([
    ['repair', 'Khi đặt lịch sửa chữa có thể đến trong khoảng bao lâu?', '30 phút'],
    ['rescue', 'Cứu hộ phản hồi yêu cầu trong bao lâu?', '10 phút'],
  ] as const)('returns approved %s facts', async (serviceType, query, value) => {
    const result = await searchAfterSalesRepository({
      serviceType,
      vehicleType: 'car',
      query,
      topK: 4,
    }, `call-${serviceType}`)

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return
    expect(result.data.groups.some((group: any) => group.summary.includes(value))).toBe(true)
  })

  it('filters active motorbike workshops by normalized Hồ Chí Minh aliases', async () => {
    const result = await findServiceLocationsRepository({
      vehicleType: 'motorbike',
      province: 'TP.HCM',
      query: 'Các xưởng xe máy điện VinFast tại TP.HCM mở cửa lúc mấy giờ?',
      limit: 1,
    }, 'call-locations')

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return
    expect(result.data.totalMatches).toBe(3)
    expect(result.data.locations).toHaveLength(3)
    expect(result.data.locations.every((item: any) => item.operatingHours.opensAt === '08h00')).toBe(true)
    expect(result.data.locations.every((item: any) => item.operatingHours.closesAt === '21h00')).toBe(true)
    expect(result.data.route).toBe('/after-sales?vehicle=motorbike&tab=workshop')
    expect(result.evidence.every((item) => item.entity.kind === 'SERVICE_LOCATION')).toBe(true)
  })
})
